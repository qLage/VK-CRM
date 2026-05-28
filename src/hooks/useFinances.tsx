import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  related_user_id: string | null;
  related_report_id: string | null;
  account_type?: 'cash' | 'account';
  created_by: string;
  created_at: string;
}

interface TransactionInsert {
  type: 'income' | 'expense';
  category: string;
  description: string;
  amount: number;
  related_user_id?: string;
  related_report_id?: string;
  account_type: 'cash' | 'account';
  booked_at?: string;
  /** Только для PATCH комиссии из deal_table_rows (виртуальная строка в списке) */
  year?: number;
  month?: number;
}

export function useFinances() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/finances/transactions');
      if (error) throw error;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data)) return data;
      return [] as Transaction[];
    },
    staleTime: 300000,
    gcTime: 900000,
    refetchOnWindowFocus: false,
  });

  // Authoritative finance stats from backend (prevents UI glitches when list pagination/filtering occurs)
  const { data: serverStats } = useQuery({
    queryKey: ['finance-stats'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/finances/stats');
      if (error) throw error;
      return data as {
        income: number;
        expense: number;
        profit: number;
        balance: number;
        balanceCash: number;
        balanceAccount: number;
      };
    },
    staleTime: 300000,
    gcTime: 900000,
    refetchOnWindowFocus: false,
  });

  const addTransaction = useMutation({
    mutationFn: async (transaction: TransactionInsert) => {
      const { error } = await localAPI.request('/finances/transactions', {
        method: 'POST',
        body: transaction,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinances();
      toast.success('Транзакция добавлена');
    },
    onError: () => {
      toast.error('Ошибка при добавлении транзакции');
    },
  });

  // Calculate stats client-side (fallback), but prefer serverStats for correctness.
  const statsFallback = {
    income: 0,
    expense: 0,
    profit: 0,
    balance: 0,
    balanceCash: 0,
    balanceAccount: 0,
  };

  transactions.forEach(t => {
    const amount = Number(t.amount);
    if (t.type === 'income') {
      statsFallback.income += amount;
      statsFallback.profit += amount;
      statsFallback.balance += amount;
      if (t.account_type === 'account') {
        statsFallback.balanceAccount += amount;
      } else {
        // Default to cash if not specified
        statsFallback.balanceCash += amount;
      }
    } else {
      statsFallback.expense += amount;
      statsFallback.profit -= amount;
      statsFallback.balance -= amount;
      if (t.account_type === 'account') {
        statsFallback.balanceAccount -= amount;
      } else {
        statsFallback.balanceCash -= amount;
      }
    }
  });

  const stats = serverStats ?? statsFallback;

  // Keep stats in sync when mutations run
  const invalidateFinances = () => {
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['finance-analytics'] });
    queryClient.invalidateQueries({ queryKey: ['finance-stats'] });
    queryClient.invalidateQueries({ queryKey: ['salaried-employees-list'] });
  };

  void stats; // satisfy linter when using stats in return

  const deleteTransaction = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await localAPI.request(`/finances/transactions/${id}`, { method: 'DELETE' });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinances();
      toast.success('Транзакция удалена');
    },
    onError: () => toast.error('Ошибка при удалении'),
  });

  const updateTransaction = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TransactionInsert> }) => {
      const { error } = await localAPI.request(`/finances/transactions/${id}`, {
        method: 'PATCH',
        body: data,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateFinances();
      toast.success('Транзакция обновлена');
    },
    onError: () => toast.error('Ошибка при обновлении'),
  });

  return {
    transactions,
    isLoading,
    stats,
    addTransaction: addTransaction.mutate,
    isAdding: addTransaction.isPending,
    deleteTransaction: deleteTransaction.mutate,
    isDeleting: deleteTransaction.isPending,
    updateTransaction: updateTransaction.mutate,
    isUpdating: updateTransaction.isPending,
  };
}
