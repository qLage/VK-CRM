import { drizzle } from '../db';
import { deals } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { Deal, DealFilters, PaginationParams, DealListResult } from '../types/models';

class DealDrizzle {
  static async create(dealData: Partial<Deal>): Promise<Deal> {
    const result = await drizzle
      .insert(deals)
      .values({
        id: uuidv4(),
        propertyObject: dealData.property_object || null,
        documentType: dealData.document_type || null,
        documentDate: dealData.document_date || null,
        sellerName: dealData.seller_name || null,
        sellerPhone: dealData.seller_phone || null,
        buyerName: dealData.buyer_name || null,
        buyerPhone: dealData.buyer_phone || null,
        depositDate: dealData.deposit_date || null,
        dealDate: dealData.deal_date || null,
        receiptDate: dealData.receipt_date || null,
        serviceType: dealData.service_type || null,
        hasMortgage: dealData.has_mortgage || 0,
        mortgageAmount: dealData.mortgage_amount || 0,
        status: dealData.status || 'draft',
        periodMonth: dealData.period_month || null,
        periodYear: dealData.period_year || null,
        createdBy: dealData.created_by || null,
        companyId: dealData.company_id!,
      })
      .returning();

    return this.mapToLegacyFormat(result[0]);
  }

  static async getById(dealId: string, companyId: string): Promise<Deal | undefined> {
    const result = await drizzle
      .select()
      .from(deals)
      .where(and(eq(deals.id, dealId), eq(deals.companyId, companyId)))
      .limit(1);

    return result[0] ? this.mapToLegacyFormat(result[0]) : undefined;
  }

  static async list(
    companyId: string,
    filters: DealFilters = {},
    pagination: PaginationParams = {}
  ): Promise<DealListResult> {
    const { status, period_month, period_year, created_by } = filters;
    const { page = 1, limit = 20 } = pagination;
    const offset = (page - 1) * limit;

    // Build where conditions
    const conditions = [eq(deals.companyId, companyId)];

    if (status) conditions.push(eq(deals.status, status));
    if (period_month) conditions.push(eq(deals.periodMonth, period_month));
    if (period_year) conditions.push(eq(deals.periodYear, period_year));
    if (created_by) conditions.push(eq(deals.createdBy, created_by));

    // Get total count
    const countResult = await drizzle
      .select({ count: sql<number>`count(*)` })
      .from(deals)
      .where(and(...conditions));

    const total = Number(countResult[0].count);

    // Get paginated results
    const result = await drizzle
      .select()
      .from(deals)
      .where(and(...conditions))
      .orderBy(desc(deals.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      deals: result.map(d => this.mapToLegacyFormat(d)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }

  static async update(dealId: string, companyId: string, updates: Partial<Deal>): Promise<Deal> {
    const updateData: any = {};

    // Map legacy field names to Drizzle schema names
    if (updates.property_object !== undefined) updateData.propertyObject = updates.property_object;
    if (updates.document_type !== undefined) updateData.documentType = updates.document_type;
    if (updates.document_date !== undefined) updateData.documentDate = updates.document_date;
    if (updates.seller_name !== undefined) updateData.sellerName = updates.seller_name;
    if (updates.seller_phone !== undefined) updateData.sellerPhone = updates.seller_phone;
    if (updates.buyer_name !== undefined) updateData.buyerName = updates.buyer_name;
    if (updates.buyer_phone !== undefined) updateData.buyerPhone = updates.buyer_phone;
    if (updates.deposit_date !== undefined) updateData.depositDate = updates.deposit_date;
    if (updates.deal_date !== undefined) updateData.dealDate = updates.deal_date;
    if (updates.receipt_date !== undefined) updateData.receiptDate = updates.receipt_date;
    if (updates.service_type !== undefined) updateData.serviceType = updates.service_type;
    if (updates.has_mortgage !== undefined) updateData.hasMortgage = updates.has_mortgage;
    if (updates.mortgage_amount !== undefined) updateData.mortgageAmount = updates.mortgage_amount;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.period_month !== undefined) updateData.periodMonth = updates.period_month;
    if (updates.period_year !== undefined) updateData.periodYear = updates.period_year;

    updateData.updatedAt = sql`NOW()`;

    const result = await drizzle
      .update(deals)
      .set(updateData)
      .where(and(eq(deals.id, dealId), eq(deals.companyId, companyId)))
      .returning();

    if (!result[0]) {
      throw new Error('Deal not found');
    }

    return this.mapToLegacyFormat(result[0]);
  }

  static async delete(dealId: string, companyId: string): Promise<Deal> {
    const result = await drizzle
      .update(deals)
      .set({ status: 'cancelled', updatedAt: sql`NOW()` })
      .where(and(eq(deals.id, dealId), eq(deals.companyId, companyId)))
      .returning();

    if (!result[0]) {
      throw new Error('Deal not found');
    }

    return this.mapToLegacyFormat(result[0]);
  }

  // Helper method to map Drizzle camelCase to legacy snake_case
  private static mapToLegacyFormat(deal: any): Deal {
    return {
      id: deal.id,
      property_object: deal.propertyObject,
      document_type: deal.documentType,
      document_date: deal.documentDate,
      seller_name: deal.sellerName,
      seller_phone: deal.sellerPhone,
      buyer_name: deal.buyerName,
      buyer_phone: deal.buyerPhone,
      deposit_date: deal.depositDate,
      deal_date: deal.dealDate,
      receipt_date: deal.receiptDate,
      service_type: deal.serviceType,
      has_mortgage: deal.hasMortgage,
      mortgage_amount: deal.mortgageAmount,
      status: deal.status,
      period_month: deal.periodMonth,
      period_year: deal.periodYear,
      created_by: deal.createdBy,
      created_at: deal.createdAt,
      updated_at: deal.updatedAt,
      company_id: deal.companyId,
    };
  }
}

export default DealDrizzle;
