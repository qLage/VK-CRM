import { db } from '../db/drizzle';
import { profiles } from '../db/schema/auth';
import { teams } from '../db/schema/organizational';
import { eq, and } from 'drizzle-orm';

/**
 * Basic employee data
 */
export interface Employee {
  id: string;
  full_name: string | null;
  position_id: string | null;
  team_id: string | null;
  branch_id: string | null;
}

/**
 * Recursive team hierarchy structure
 */
export interface TeamHierarchy {
  id: string;
  full_name: string | null;
  position_id: string | null;
  team_id: string | null;
  branch_id: string | null;
  direct_reports: TeamHierarchy[];
}

/**
 * Manager information with position details
 */
export interface ManagerInfo {
  id: string;
  full_name: string | null;
  position_name: string | null;
  team_id: string | null;
  branch_id: string | null;
}

/**
 * Service for team hierarchy operations
 */
export class TeamService {
  /**
   * Get team members by team ID
   * Note: Database schema uses team_id for grouping, not manager_id hierarchy
   */
  async getTeamMembers(teamId: string): Promise<Employee[]> {
    const members = await db
      .select({
        id: profiles.id,
        full_name: profiles.fullName,
        position_id: profiles.positionId,
        team_id: profiles.teamId,
        branch_id: profiles.branchId,
      })
      .from(profiles)
      .where(
        and(
          eq(profiles.teamId, teamId),
          eq(profiles.isActive, 1)
        )
      );

    return members;
  }

  /**
   * Get team hierarchy (flat list for now, as schema doesn't have manager_id)
   * Returns team leader with all team members as direct reports
   */
  async getTeamHierarchy(teamId: string): Promise<TeamHierarchy> {
    // Get team info to find leader
    const teamResult = await db
      .select({
        id: teams.id,
        name: teams.name,
        leaderId: teams.leaderId,
      })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    if (teamResult.length === 0) {
      throw new Error(`Team with id ${teamId} not found`);
    }

    const team = teamResult[0];
    const leaderId = team.leaderId;

    if (!leaderId) {
      throw new Error(`Team ${teamId} has no leader assigned`);
    }

    // Get leader info
    const leaderResult = await db
      .select({
        id: profiles.id,
        full_name: profiles.fullName,
        position_id: profiles.positionId,
        team_id: profiles.teamId,
        branch_id: profiles.branchId,
      })
      .from(profiles)
      .where(eq(profiles.id, leaderId))
      .limit(1);

    if (leaderResult.length === 0) {
      throw new Error(`Team leader ${leaderId} not found`);
    }

    const leader = leaderResult[0];

    // Get all team members (excluding leader)
    const members = await db
      .select({
        id: profiles.id,
        full_name: profiles.fullName,
        position_id: profiles.positionId,
        team_id: profiles.teamId,
        branch_id: profiles.branchId,
      })
      .from(profiles)
      .where(
        and(
          eq(profiles.teamId, teamId),
          eq(profiles.isActive, 1)
        )
      );

    // Build flat hierarchy: leader with all members as direct reports
    const directReports: TeamHierarchy[] = members
      .filter(m => m.id !== leaderId)
      .map(member => ({
        id: member.id,
        full_name: member.full_name,
        position_id: member.position_id,
        team_id: member.team_id,
        branch_id: member.branch_id,
        direct_reports: [],
      }));

    return {
      id: leader.id,
      full_name: leader.full_name,
      position_id: leader.position_id,
      team_id: leader.team_id,
      branch_id: leader.branch_id,
      direct_reports: directReports,
    };
  }

  /**
   * Get all employees in a branch
   */
  async getBranchEmployees(branchId: string): Promise<Employee[]> {
    const employees = await db
      .select({
        id: profiles.id,
        full_name: profiles.fullName,
        position_id: profiles.positionId,
        team_id: profiles.teamId,
        branch_id: profiles.branchId,
      })
      .from(profiles)
      .where(
        and(
          eq(profiles.branchId, branchId),
          eq(profiles.isActive, 1)
        )
      );

    return employees;
  }

  /**
   * Get all employees in a team
   */
  async getEmployeesByTeam(teamId: string): Promise<Employee[]> {
    const employees = await db
      .select({
        id: profiles.id,
        full_name: profiles.fullName,
        position_id: profiles.positionId,
        team_id: profiles.teamId,
        branch_id: profiles.branchId,
      })
      .from(profiles)
      .where(
        and(
          eq(profiles.teamId, teamId),
          eq(profiles.isActive, 1)
        )
      );

    return employees;
  }

  /**
   * Get manager information with position details
   */
  async getManagerInfo(userId: string): Promise<ManagerInfo | null> {
    const result = await db
      .select({
        id: profiles.id,
        full_name: profiles.fullName,
        position_id: profiles.positionId,
        team_id: profiles.teamId,
        branch_id: profiles.branchId,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);

    if (result.length === 0) {
      return null;
    }

    const profile = result[0];

    // For now, return without position name (would need JOIN with positions table)
    // Position name can be added in future if needed
    return {
      id: profile.id,
      full_name: profile.full_name,
      position_name: null, // TODO: JOIN with positions table if needed
      team_id: profile.team_id,
      branch_id: profile.branch_id,
    };
  }
}

// Export singleton instance
export default new TeamService();
