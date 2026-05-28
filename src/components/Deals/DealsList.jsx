import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { dealsAPI } from '../../services/dealsAPI';
import './DealsList.css';

const DealsList = () => {
  const navigate = useNavigate();
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    document_type: '',
    agent_id: ''
  });

  useEffect(() => {
    fetchDeals();
  }, [filters]);

  const fetchDeals = async () => {
    try {
      setLoading(true);
      const response = await dealsAPI.list(filters);
      setDeals(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching deals:', err);
      setError('Failed to load deals');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCreateDeal = () => {
    navigate('/deals/new');
  };

  const handleViewDeal = (dealId) => {
    navigate(`/deals/${dealId}`);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: 'RUB',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('ru-RU');
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      draft: { label: 'Черновик', className: 'status-draft' },
      active: { label: 'Активная', className: 'status-active' },
      pending: { label: 'Ожидание', className: 'status-pending' },
      completed: { label: 'Завершена', className: 'status-completed' },
      cancelled: { label: 'Отменена', className: 'status-cancelled' }
    };
    const statusInfo = statusMap[status] || { label: status, className: '' };
    return <span className={`status-badge ${statusInfo.className}`}>{statusInfo.label}</span>;
  };

  if (loading) {
    return <div className="deals-loading">Загрузка сделок...</div>;
  }

  if (error) {
    return <div className="deals-error">{error}</div>;
  }

  return (
    <div className="deals-list-container">
      <div className="deals-header">
        <h1>Сделки</h1>
        <button className="btn-primary" onClick={handleCreateDeal}>
          + Создать сделку
        </button>
      </div>

      <div className="deals-filters">
        <select
          value={filters.status}
          onChange={(e) => handleFilterChange('status', e.target.value)}
          className="filter-select"
        >
          <option value="">Все статусы</option>
          <option value="draft">Черновик</option>
          <option value="active">Активная</option>
          <option value="pending">Ожидание</option>
          <option value="completed">Завершена</option>
          <option value="cancelled">Отменена</option>
        </select>

        <select
          value={filters.document_type}
          onChange={(e) => handleFilterChange('document_type', e.target.value)}
          className="filter-select"
        >
          <option value="">Все типы документов</option>
          <option value="sale">Продажа</option>
          <option value="rent">Аренда</option>
          <option value="management">Управление</option>
        </select>
      </div>

      {deals.length === 0 ? (
        <div className="deals-empty">
          <p>Сделок не найдено</p>
          <button className="btn-secondary" onClick={handleCreateDeal}>
            Создать первую сделку
          </button>
        </div>
      ) : (
        <div className="deals-table-container">
          <table className="deals-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Адрес объекта</th>
                <th>Тип документа</th>
                <th>Статус</th>
                <th>Сумма сделки</th>
                <th>Комиссия</th>
                <th>Дата создания</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((deal) => (
                <tr key={deal.id} onClick={() => handleViewDeal(deal.id)} className="deal-row">
                  <td>{deal.id}</td>
                  <td className="deal-address">{deal.property_address}</td>
                  <td>{deal.document_type}</td>
                  <td>{getStatusBadge(deal.status)}</td>
                  <td>{formatCurrency(deal.deal_amount)}</td>
                  <td>{formatCurrency(deal.total_commission)}</td>
                  <td>{formatDate(deal.created_at)}</td>
                  <td>
                    <button
                      className="btn-view"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewDeal(deal.id);
                      }}
                    >
                      Открыть
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DealsList;
