import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dealsAPI, participantsAPI, commissionsAPI, documentsAPI, paymentsAPI, activitiesAPI } from '../../services/dealsAPI';
import './DealDetail.css';

const DealDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [deal, setDeal] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [payments, setPayments] = useState([]);
  const [activities, setActivities] = useState([]);
  const [financialSummary, setFinancialSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchDealData();
  }, [id]);

  const fetchDealData = async () => {
    try {
      setLoading(true);
      const [
        dealRes,
        participantsRes,
        commissionsRes,
        documentsRes,
        paymentsRes,
        activitiesRes,
        summaryRes
      ] = await Promise.all([
        dealsAPI.getById(id),
        participantsAPI.getByDeal(id),
        commissionsAPI.getByDeal(id),
        documentsAPI.getByDeal(id),
        paymentsAPI.getByDeal(id),
        activitiesAPI.getByDeal(id, { limit: 20 }),
        dealsAPI.getFinancialSummary(id)
      ]);

      setDeal(dealRes.data);
      setParticipants(participantsRes.data);
      setCommissions(commissionsRes.data);
      setDocuments(documentsRes.data);
      setPayments(paymentsRes.data);
      setActivities(activitiesRes.data);
      setFinancialSummary(summaryRes.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching deal data:', err);
      setError('Failed to load deal data');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = () => {
    navigate(`/deals/${id}/edit`);
  };

  const handleDelete = async () => {
    if (!window.confirm('Вы уверены, что хотите удалить эту сделку?')) {
      return;
    }

    try {
      await dealsAPI.delete(id);
      navigate('/deals');
    } catch (err) {
      console.error('Error deleting deal:', err);
      alert('Failed to delete deal');
    }
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

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('ru-RU');
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
    return <div className="deal-detail-loading">Загрузка...</div>;
  }

  if (error || !deal) {
    return <div className="deal-detail-error">{error || 'Deal not found'}</div>;
  }

  return (
    <div className="deal-detail-container">
      <div className="deal-detail-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/deals')}>
            ← Назад
          </button>
          <div className="header-info">
            <h1>{deal.property_address}</h1>
            <div className="header-meta">
              <span>ID: {deal.id}</span>
              <span>•</span>
              {getStatusBadge(deal.status)}
            </div>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn-secondary" onClick={handleEdit}>
            Редактировать
          </button>
          <button className="btn-danger" onClick={handleDelete}>
            Удалить
          </button>
        </div>
      </div>

      <div className="deal-detail-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Обзор
        </button>
        <button
          className={`tab ${activeTab === 'participants' ? 'active' : ''}`}
          onClick={() => setActiveTab('participants')}
        >
          Участники ({participants.length})
        </button>
        <button
          className={`tab ${activeTab === 'commissions' ? 'active' : ''}`}
          onClick={() => setActiveTab('commissions')}
        >
          Комиссии ({commissions.length})
        </button>
        <button
          className={`tab ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          Документы ({documents.length})
        </button>
        <button
          className={`tab ${activeTab === 'payments' ? 'active' : ''}`}
          onClick={() => setActiveTab('payments')}
        >
          Платежи ({payments.length})
        </button>
        <button
          className={`tab ${activeTab === 'activities' ? 'active' : ''}`}
          onClick={() => setActiveTab('activities')}
        >
          История ({activities.length})
        </button>
      </div>

      <div className="deal-detail-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <div className="info-grid">
              <div className="info-card">
                <h3>Информация о сделке</h3>
                <div className="info-row">
                  <span className="label">Адрес объекта:</span>
                  <span className="value">{deal.property_address}</span>
                </div>
                <div className="info-row">
                  <span className="label">Тип документа:</span>
                  <span className="value">{deal.document_type}</span>
                </div>
                <div className="info-row">
                  <span className="label">Тип недвижимости:</span>
                  <span className="value">{deal.property_type || '-'}</span>
                </div>
                <div className="info-row">
                  <span className="label">Статус:</span>
                  <span className="value">{getStatusBadge(deal.status)}</span>
                </div>
                <div className="info-row">
                  <span className="label">Дата создания:</span>
                  <span className="value">{formatDate(deal.created_at)}</span>
                </div>
              </div>

              <div className="info-card">
                <h3>Финансы</h3>
                <div className="info-row">
                  <span className="label">Сумма сделки:</span>
                  <span className="value">{formatCurrency(deal.deal_amount)}</span>
                </div>
                <div className="info-row">
                  <span className="label">Общая комиссия:</span>
                  <span className="value">{formatCurrency(deal.total_commission)}</span>
                </div>
                {financialSummary && (
                  <>
                    <div className="info-row">
                      <span className="label">Выплачено комиссий:</span>
                      <span className="value">{formatCurrency(financialSummary.total_commissions_paid || 0)}</span>
                    </div>
                    <div className="info-row">
                      <span className="label">Получено платежей:</span>
                      <span className="value">{formatCurrency(financialSummary.total_payments_received || 0)}</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {deal.notes && (
              <div className="info-card">
                <h3>Примечания</h3>
                <p>{deal.notes}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'participants' && (
          <div className="participants-tab">
            <div className="tab-header">
              <h3>Участники сделки</h3>
              <button className="btn-primary">+ Добавить участника</button>
            </div>
            {participants.length === 0 ? (
              <p className="empty-message">Участников нет</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Тип</th>
                      <th>Имя</th>
                      <th>Контакт</th>
                      <th>Примечания</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => (
                      <tr key={p.id}>
                        <td>{p.participant_type}</td>
                        <td>{p.participant_name}</td>
                        <td>{p.contact_info || '-'}</td>
                        <td>{p.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'commissions' && (
          <div className="commissions-tab">
            <div className="tab-header">
              <h3>Комиссии</h3>
              <button className="btn-primary">+ Добавить комиссию</button>
            </div>
            {commissions.length === 0 ? (
              <p className="empty-message">Комиссий нет</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Получатель</th>
                      <th>Сумма</th>
                      <th>Процент</th>
                      <th>Статус</th>
                      <th>Дата выплаты</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.map((c) => (
                      <tr key={c.id}>
                        <td>{c.recipient_type}</td>
                        <td>{formatCurrency(c.commission_amount)}</td>
                        <td>{c.commission_percent}%</td>
                        <td>{c.payment_status}</td>
                        <td>{formatDate(c.payment_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="documents-tab">
            <div className="tab-header">
              <h3>Документы</h3>
              <button className="btn-primary">+ Загрузить документ</button>
            </div>
            {documents.length === 0 ? (
              <p className="empty-message">Документов нет</p>
            ) : (
              <div className="documents-grid">
                {documents.map((doc) => (
                  <div key={doc.id} className="document-card">
                    <div className="document-icon">📄</div>
                    <div className="document-info">
                      <div className="document-name">{doc.file_name}</div>
                      <div className="document-meta">
                        {doc.document_type} • {formatDate(doc.created_at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="payments-tab">
            <div className="tab-header">
              <h3>Платежи</h3>
              <button className="btn-primary">+ Добавить платеж</button>
            </div>
            {payments.length === 0 ? (
              <p className="empty-message">Платежей нет</p>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Тип</th>
                      <th>Сумма</th>
                      <th>Дата</th>
                      <th>Метод</th>
                      <th>Плательщик</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id}>
                        <td>{p.payment_type}</td>
                        <td>{formatCurrency(p.amount)}</td>
                        <td>{formatDate(p.payment_date)}</td>
                        <td>{p.payment_method || '-'}</td>
                        <td>{p.payer_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'activities' && (
          <div className="activities-tab">
            <h3>История активности</h3>
            {activities.length === 0 ? (
              <p className="empty-message">Активностей нет</p>
            ) : (
              <div className="activities-timeline">
                {activities.map((activity) => (
                  <div key={activity.id} className="activity-item">
                    <div className="activity-time">{formatDateTime(activity.created_at)}</div>
                    <div className="activity-content">
                      <div className="activity-type">{activity.activity_type}</div>
                      <div className="activity-description">{activity.description}</div>
                      <div className="activity-user">{activity.performed_by_name}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DealDetail;
