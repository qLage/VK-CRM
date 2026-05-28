import { FileText, Home, Handshake, Building, Key, Users, Calendar, Megaphone, ShoppingCart } from 'lucide-react';

export const REQUEST_TYPES = {
    SHOWING: 'showing',
    DEAL: 'deal',
    DEPOSIT: 'deposit',
    BOOKING_NEW: 'booking_new',
    DEAL_NEW_AFTER: 'deal_new_after',
    LISTING: 'listing',
    MEETING: 'meeting',
    SALE: 'sale',
    PURCHASE: 'purchase',
    TAKE: 'take',
    OBJECT: 'object',
    MEETING_OFFICE: 'meeting_office',
    PREPAYMENT: 'prepayment',
} as const;

export const REQUEST_TYPE_LABELS = {
    [REQUEST_TYPES.SHOWING]: { label: 'Показ', icon: Home, color: 'text-blue-500' },
    [REQUEST_TYPES.DEAL]: { label: 'Сделка', icon: Handshake, color: 'text-green-500' },
    [REQUEST_TYPES.DEPOSIT]: { label: 'Задаток', icon: FileText, color: 'text-amber-500' },
    [REQUEST_TYPES.BOOKING_NEW]: { label: 'Бронь (Новострой)', icon: Building, color: 'text-purple-500' },
    [REQUEST_TYPES.DEAL_NEW_AFTER]: { label: 'После сделки (Новострой)', icon: Building, color: 'text-indigo-500' },
    [REQUEST_TYPES.LISTING]: { label: 'Взятие объекта', icon: Key, color: 'text-emerald-500' },
    [REQUEST_TYPES.MEETING]: { label: 'Встреча в офисе', icon: Users, color: 'text-orange-500' },
    [REQUEST_TYPES.SALE]: { label: 'Продажа (Отчет)', icon: Megaphone, color: 'text-cyan-500' },
    [REQUEST_TYPES.PURCHASE]: { label: 'Покупка (Запрос)', icon: ShoppingCart, color: 'text-rose-500' },
    [REQUEST_TYPES.TAKE]: { label: 'Взятие объекта', icon: Key, color: 'text-emerald-500' },
    [REQUEST_TYPES.OBJECT]: { label: 'Объект', icon: Home, color: 'text-blue-500' },
    [REQUEST_TYPES.MEETING_OFFICE]: { label: 'Встреча в офисе', icon: Users, color: 'text-orange-500' },
    [REQUEST_TYPES.PREPAYMENT]: { label: 'Задаток (Предоплата)', icon: FileText, color: 'text-amber-500' },
};

// Default fields for Daily Plan
export const DAILY_PLAN_FIELDS = [
    { id: 'focus_goals', label: 'Главные цели на сегодня', type: 'textarea', required: true, placeholder: 'Опишите 1-3 ключевые задачи...' },
    { id: 'meetings_plan', label: 'Запланировано встреч', type: 'number', required: true, placeholder: '0' },
    { id: 'calls_plan', label: 'План по звонкам', type: 'number', required: true, placeholder: '0' },
    { id: 'notes', label: 'Дополнительные заметки', type: 'textarea', required: false, placeholder: 'Особенности сегодняшнего дня...' },
];

// Default fields for Daily Report
export const DAILY_REPORT_FIELDS = [
    { id: 'calls_out', label: 'Исходящие звонки', type: 'number', required: true, placeholder: '0' },
    { id: 'calls_in', label: 'Входящие звонки', type: 'number', required: true, placeholder: '0' },
    { id: 'meetings_fact', label: 'Проведенные встречи', type: 'number', required: true, placeholder: '0' },
    { id: 'plan', label: 'План на завтра', type: 'textarea', required: true, placeholder: 'Подробно опишите план...' },
    { id: 'problems', label: 'Проблемы и вопросы', type: 'textarea', required: false, placeholder: 'Что мешает работе?' },
];

export const TEMPLATES = {
    plan: {
        title: 'План на день',
        fields: DAILY_PLAN_FIELDS
    },
    daily: {
        title: 'Ежедневный отчёт',
        fields: DAILY_REPORT_FIELDS
    },
    [REQUEST_TYPES.SHOWING]: {
        title: 'Отчет о показе',
        fields: [
            { id: 'object', label: 'Объект', type: 'text', placeholder: 'Название или код' },
            { id: 'address', label: 'Адрес', type: 'text' },
            { id: 'client_name', label: 'Имя клиента', type: 'text' },
            { id: 'phone', label: 'Телефон', type: 'text' },
            { id: 'payment_method', label: 'Форма расчетов', type: 'select', options: ['Наличные', 'Ипотека', 'Сертификат', 'Рассрочка'] },
            { id: 'search_duration', label: 'Сколько ищет', type: 'text' },
            { id: 'deadline', label: 'Сроки покупки', type: 'text' },
            { id: 'for_whom', label: 'Для кого покупают', type: 'text' },
            { id: 'criteria', label: 'Главные критерии', type: 'textarea' },
            { id: 'showing_result', label: 'Как прошел показ', type: 'textarea' },
            { id: 'selection_worked', label: 'Получилось ли отработать на подбор', type: 'select', options: ['Да', 'Нет'] },
            { id: 'reason_failed', label: 'Если нет — почему', type: 'textarea', condition: { field: 'selection_worked', value: 'Нет' } },
        ]
    },
    [REQUEST_TYPES.DEAL]: {
        title: 'Служебка на сделку',
        fields: [
            { id: 'deal_date', label: 'Дата выхода на сделку', type: 'date' },
            { id: 'documents', label: 'Список необходимых документов', type: 'textarea', placeholder: 'Паспорт, СНИЛС, ИНН...' },
            { id: 'location', label: 'Место проведения сделки', type: 'text' },
            { id: 'payment_method', label: 'Форма расчетов', type: 'select', options: ['Наличные', 'СБР', 'Ипотека'] },
            { id: 'commission', label: 'Сумма комиссии (остатка) и срок оплаты', type: 'text' },
        ]
    },
    [REQUEST_TYPES.DEPOSIT]: {
        title: 'Служебка на задаток',
        fields: [
            { id: 'object', label: 'Объект и адрес', type: 'text' },
            { id: 'buyer', label: 'Покупатель (ФИО)', type: 'text' },
            { id: 'seller', label: 'Продавец (ФИО)', type: 'text' },
            { id: 'deposit_sum', label: 'Сумма задатка', type: 'number' },
            { id: 'actual_price', label: 'Фактическая стоимость объекта', type: 'number' },
            { id: 'contract_price', label: 'Стоимость в ДКП', type: 'number' },
            { id: 'diff_status', label: 'Занижение / Завышение', type: 'select', options: ['Нет', 'Занижение', 'Завышение'] },
            { id: 'payment_method', label: 'Форма расчетов', type: 'text' },
            { id: 'sum_per_method', label: 'Сумма по каждой форме', type: 'textarea' },
            { id: 'bank', label: 'Банк', type: 'text' },
            { id: 'transfer_method', label: 'Как передается задаток', type: 'text' },
            { id: 'deposit_date', label: 'Дата и время задатка', type: 'datetime-local' },
            { id: 'docs_deadline', label: 'Когда будут документы (для юриста)', type: 'text' },
            { id: 'notes', label: 'Доп. информация', type: 'textarea' },
            { label: 'Комиссия', type: 'separator', id: 'separator_commission' },
            { id: 'commission_payer', label: 'Кто платит', type: 'text' },
            { id: 'commission_sum', label: 'Сумма комиссии', type: 'number' },
            { id: 'commission_date', label: 'Когда оплатят', type: 'text' },
        ]
    },
    [REQUEST_TYPES.BOOKING_NEW]: {
        title: 'Бронирование (Новостройки)',
        fields: [
            { id: 'booking_date', label: 'Дата и время брони', type: 'datetime-local' },
            { id: 'client_name', label: 'ФИО клиента', type: 'text' },
            { id: 'booking_contract', label: 'Договор бронирования', type: 'text', placeholder: 'Вставьте ссылку на файл' },
            { id: 'developer', label: 'Название застройщика', type: 'text' },
            { id: 'developer_commission', label: 'Комиссия застройщика (%)', type: 'text' },
            { id: 'deal_date_est', label: 'Примерная дата выхода на сделку', type: 'date' },
            { id: 'situation', label: 'Кратко о ситуации', type: 'textarea' }
        ]
    },
    [REQUEST_TYPES.DEAL_NEW_AFTER]: {
        title: 'После сделки (Новостройки)',
        fields: [
            { id: 'client_name', label: 'ФИО Клиента', type: 'text' },
            { id: 'doc_type', label: 'Оформленный документ', type: 'select', options: ['ДДУ', 'ДКП'] },
        ]
    },
    [REQUEST_TYPES.LISTING]: {
        title: 'Взятие объекта',
        fields: [
            { id: 'object', label: 'Объект', type: 'text' },
            { id: 'address', label: 'Адрес', type: 'text' },
            { id: 'owner_name', label: 'Имя собственника', type: 'text' },
            { id: 'phone', label: 'Телефон', type: 'text' },
            { id: 'time', label: 'Время взятия', type: 'datetime-local' },
            { id: 'result', label: 'Как прошло взятие?', type: 'textarea' },
        ]
    },
    [REQUEST_TYPES.MEETING]: {
        title: 'Встреча в офисе',
        fields: [
            { id: 'date', label: 'Дата и время', type: 'datetime-local' },
            { id: 'goal', label: 'Цель встречи', type: 'text' },
            { id: 'client_name', label: 'ФИО Клиента', type: 'text' },
            { id: 'phone', label: 'Номер телефона', type: 'text' },
        ]
    },
    [REQUEST_TYPES.SALE]: {
        title: 'Продажа (Отчет)',
        fields: [
            { id: 'object', label: 'Объект', type: 'text' },
            { id: 'address', label: 'Адрес', type: 'text' },
            { id: 'client_name', label: 'Клиент (ФИО)', type: 'text' },
            { id: 'phone', label: 'Номер', type: 'text' },
            { label: 'Ситуация по квартире', type: 'separator', id: 'separator_situation' },
            { id: 'contract_signed', label: 'Договор подписан?', type: 'select', options: ['Да', 'Нет'] },
            { id: 'mortgage', label: 'Ипотека', type: 'select', options: ['Да', 'Нет'] },
            { id: 'matcap', label: 'Маткап', type: 'select', options: ['Да', 'Нет'] },
            { id: 'understatement', label: 'Занижение', type: 'select', options: ['Да', 'Нет'] },
            { id: 'overpriced', label: 'Насколько завышена цена', type: 'text' },
            { id: 'sale_goal', label: 'Цель продажи', type: 'text' },
            { id: 'sold_themselves', label: 'Сколько продавали сами', type: 'text' },
            { id: 'selling_duration', label: 'Сколько продаете вы', type: 'text' },
            { id: 'feedback', label: 'Отчет продавцу + обратная связь', type: 'textarea' },
        ]
    },
    [REQUEST_TYPES.PURCHASE]: {
        title: 'Покупка (Запрос)',
        fields: [
            { id: 'client_name', label: 'ФИО', type: 'text' },
            { id: 'phone', label: 'Номер', type: 'text' },
            { id: 'request', label: 'Запрос', type: 'textarea' },
            { id: 'budget', label: 'Бюджет', type: 'text' },
            { id: 'district', label: 'Район', type: 'text' },
            { id: 'area', label: 'Квадратура', type: 'text' },
            { id: 'viewed_count', label: 'Сколько объектов посмотрели', type: 'number' },
            { id: 'deadline', label: 'Сроки приобретения', type: 'text' },
        ]
    }
};
