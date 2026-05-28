import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { dealsAPI } from '../../services/dealsAPI';
import './DealForm.css';

const DealForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);

  const [formData, setFormData] = useState({
    property_address: '',
    document_type: 'sale',
    property_type: '',
    deal_amount: '',
    total_commission: '',
    commission_percent: '',
    status: 'draft',
    contract_date: '',
    closing_date: '',
    notes: ''
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isEditMode) {
      fetchDeal();
    }
  }, [id]);

  const fetchDeal = async () => {
    try {
      setLoading(true);
      const response = await dealsAPI.getById(id);
      const deal = response.data;

      setFormData({
        property_address: deal.property_address || '',
        document_type: deal.document_type || 'sale',
        property_type: deal.property_type || '',
        deal_amount: deal.deal_amount || '',
        total_commission: deal.total_commission || '',
        commission_percent: deal.commission_percent || '',
        status: deal.status || 'draft',
        contract_date: deal.contract_date ? deal.contract_date.split('T')[0] : '',
        closing_date: deal.closing_date ? deal.closing_date.split('T')[0] : '',
        notes: deal.notes || ''
      });
      setError(null);
    } catch (err) {
      console.error('Error fetching deal:', err);
      setError('Failed to load deal');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Auto-calculate commission if deal_amount and commission_percent are set
    if (name === 'deal_amount' || name === 'commission_percent') {
      const amount = name === 'deal_amount' ? parseFloat(value) : parseFloat(formData.deal_amount);
      const percent = name === 'commission_percent' ? parseFloat(value) : parseFloat(formData.commission_percent);

      if (!isNaN(amount) && !isNaN(percent)) {
        const commission = (amount * percent) / 100;
        setFormData(prev => ({
          ...prev,
          [name]: value,
          total_commission: commission.toFixed(2)
        }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!formData.property_address.trim()) {
      setError('Адрес объекта обязателен');
      return;
    }

    if (!formData.deal_amount || parseFloat(formData.deal_amount) <= 0) {
      setError('Сумма сделки должна быть больше 0');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const submitData = {
        ...formData,
        deal_amount: parseFloat(formData.deal_amount),
        total_commission: parseFloat(formData.total_commission) || 0,
        commission_percent: parseFloat(formData.commission_percent) || 0
      };

      if (isEditMode) {
        await dealsAPI.update(id, submitData);
      } else {
        await dealsAPI.create(submitData);
      }

      navigate('/deals');
    } catch (err) {
      console.error('Error saving deal:', err);
      setError(err.response?.data?.error || 'Failed to save deal');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    navigate(isEditMode ? `/deals/${id}` : '/deals');
  };

  if (loading && isEditMode) {
    return <div className="deal-form-loading">Загрузка...</div>;
  }

  return (
    <div className="deal-form-container">
      <div className="deal-form-header">
        <h1>{isEditMode ? 'Редактировать сделку' : 'Создать сделку'}</h1>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="deal-form">
        <div className="form-section">
          <h2>Основная информация</h2>

          <div className="form-group">
            <label htmlFor="property_address">
              Адрес объекта <span className="required">*</span>
            </label>
            <input
              type="text"
              id="property_address"
              name="property_address"
              value={formData.property_address}
              onChange={handleChange}
              placeholder="Введите адрес объекта недвижимости"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="document_type">
                Тип документа <span className="required">*</span>
              </label>
              <select
                id="document_type"
                name="document_type"
                value={formData.document_type}
                onChange={handleChange}
                required
              >
                <option value="sale">Продажа</option>
                <option value="rent">Аренда</option>
                <option value="management">Управление</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="property_type">Тип недвижимости</label>
              <input
                type="text"
                id="property_type"
                name="property_type"
                value={formData.property_type}
                onChange={handleChange}
                placeholder="Квартира, дом, коммерческая и т.д."
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="status">Статус</label>
            <select
              id="status"
              name="status"
              value={formData.status}
              onChange={handleChange}
            >
              <option value="draft">Черновик</option>
              <option value="active">Активная</option>
              <option value="pending">Ожидание</option>
              <option value="completed">Завершена</option>
              <option value="cancelled">Отменена</option>
            </select>
          </div>
        </div>

        <div className="form-section">
          <h2>Финансовая информация</h2>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="deal_amount">
                Сумма сделки (₽) <span className="required">*</span>
              </label>
              <input
                type="number"
                id="deal_amount"
                name="deal_amount"
                value={formData.deal_amount}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                min="0"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="commission_percent">Процент комиссии (%)</label>
              <input
                type="number"
                id="commission_percent"
                name="commission_percent"
                value={formData.commission_percent}
                onChange={handleChange}
                placeholder="0.00"
                step="0.01"
                min="0"
                max="100"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="total_commission">Общая комиссия (₽)</label>
            <input
              type="number"
              id="total_commission"
              name="total_commission"
              value={formData.total_commission}
              onChange={handleChange}
              placeholder="0.00"
              step="0.01"
              min="0"
            />
            <small className="form-hint">
              Рассчитывается автоматически при вводе суммы сделки и процента
            </small>
          </div>
        </div>

        <div className="form-section">
          <h2>Даты</h2>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="contract_date">Дата договора</label>
              <input
                type="date"
                id="contract_date"
                name="contract_date"
                value={formData.contract_date}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="closing_date">Дата закрытия</label>
              <input
                type="date"
                id="closing_date"
                name="closing_date"
                value={formData.closing_date}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        <div className="form-section">
          <h2>Дополнительная информация</h2>

          <div className="form-group">
            <label htmlFor="notes">Примечания</label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="Дополнительные заметки о сделке"
              rows="4"
            />
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={handleCancel}
            disabled={loading}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={loading}
          >
            {loading ? 'Сохранение...' : (isEditMode ? 'Сохранить изменения' : 'Создать сделку')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DealForm;
