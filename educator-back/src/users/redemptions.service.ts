import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { SubscriptionSummary } from 'src/common/types';
import { DistrictAdmin, Redemption, User, UserRole } from 'src/database/entities';
import { REDEMPTION_REPOSITORY } from 'src/database/tokens';
import { RedemptionRepository } from 'src/database/repositories';
import { DatabaseService } from 'src/database/services/database.service';
import { RoleSlug } from 'src/common/constants';
import { UserWithDistrictAdminProfile } from 'src/common/interfaces';

@Injectable()
export class RedemptionsService {
  constructor(
    @Inject(REDEMPTION_REPOSITORY)
    private readonly redemptionRepo: RedemptionRepository,
    private readonly databaseService: DatabaseService,
  ) { }

  async saveRedemption(
    user: User,
    redeemCode: string,
    salesOrder: string,
    customer: string,
    lineItems: object[],
    aiSeatsGranted: number,
  ): Promise<Redemption> {
    return this.redemptionRepo.create({
      user,
      redeem_code: redeemCode,
      sales_order: salesOrder,
      customer,
      line_items: lineItems,
      ai_seats_granted: aiSeatsGranted,
    });
  }

  async findByRedeemCode(redeemCode: string): Promise<Redemption | null> {
    return this.redemptionRepo.findOne({
      where: { redeem_code: redeemCode },
    });
  }

  async findByUserId(userId: string): Promise<Redemption[]> {
    return this.redemptionRepo.find({
      where: { user: { id: userId } },
      order: { redeemed_at: 'DESC' },
    });
  }

  async findByUserAndRedeemCode(userId: string, redeemCode: string): Promise<Redemption | null> {
    return this.redemptionRepo.findOne({
      where: { user: { id: userId }, redeem_code: redeemCode },
    });
  }

  /**
   * `isLicenseActive`/`subscriptions` no longer live on `User` — they moved to `DistrictAdmin`
   * (district-admin-plan.md). Every account reaching this method is expected to already have a
   * linked District Admin role assignment (backfilled by Phase 2's migration).
   */
  private async activateDistrictAdminSubscriptions(
    manager: EntityManager,
    userId: string,
    subscriptions: SubscriptionSummary[],
  ): Promise<UserWithDistrictAdminProfile | null> {
    const userRepo = manager.getRepository(User);
    const userRoleRepo = manager.getRepository(UserRole);
    const districtAdminRepo = manager.getRepository(DistrictAdmin);

    const user = await userRepo.findOne({ where: { id: userId } });
    if (!user) return null;

    const userRole = await userRoleRepo.findOne({
      where: { userId, role: { slug: RoleSlug.DISTRICT_ADMIN } },
    });
    if (!userRole) return null;

    await districtAdminRepo.update(
      { userRoleId: userRole.userRoleId },
      { isLicenseActive: true, subscriptions },
    );

    return { user, isLicenseActive: true, subscriptions };
  }

  async redeemAndActivateUser(params: {
    userId: string;
    redeemCode: string;
    salesOrder: string;
    customer: string;
    lineItems: object[];
    aiSeatsGranted: number;
    subscriptions: SubscriptionSummary[];
  }): Promise<UserWithDistrictAdminProfile | null> {
    return this.databaseService.runInTransaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const redemptionRepo = manager.getRepository(Redemption);

      const user = await userRepo.findOne({ where: { id: params.userId } });
      if (!user) {
        return null;
      }

      const redemption = redemptionRepo.create({
        user,
        redeem_code: params.redeemCode,
        sales_order: params.salesOrder,
        customer: params.customer,
        line_items: params.lineItems,
        ai_seats_granted: params.aiSeatsGranted,
      });

      await redemptionRepo.save(redemption);

      return this.activateDistrictAdminSubscriptions(manager, params.userId, params.subscriptions);
    });
  }

  async activateUserSubscriptions(
    userId: string,
    subscriptions: SubscriptionSummary[],
  ): Promise<UserWithDistrictAdminProfile | null> {
    return this.databaseService.runInTransaction(async (manager) =>
      this.activateDistrictAdminSubscriptions(manager, userId, subscriptions),
    );
  }
}
