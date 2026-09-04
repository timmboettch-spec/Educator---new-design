import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Redemption } from './entity/redemption.entity';
import { User } from './entity/user.entity';
import { SubscriptionSummary } from 'src/common/types';

@Injectable()
export class RedemptionsService {
  constructor(
    @InjectRepository(Redemption)
    private readonly redemptionRepo: Repository<Redemption>,
    private readonly dataSource: DataSource,
  ) {}

  async saveRedemption(
    user: User,
    redeemCode: string,
    salesOrder: string,
    customer: string,
    lineItems: object[],
    aiSeatsGranted: number,
  ): Promise<Redemption> {
    const redemption = this.redemptionRepo.create({
      user,
      redeem_code: redeemCode,
      sales_order: salesOrder,
      customer,
      line_items: lineItems,
      ai_seats_granted: aiSeatsGranted,
    });

    return this.redemptionRepo.save(redemption);
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

  async redeemAndActivateUser(params: {
    userId: string;
    redeemCode: string;
    salesOrder: string;
    customer: string;
    lineItems: object[];
    aiSeatsGranted: number;
    subscriptions: SubscriptionSummary[];
  }): Promise<User | null> {
    return this.dataSource.transaction(async (manager) => {
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

      user.is_license_active = true;
      user.subscriptions = params.subscriptions;
      return userRepo.save(user);
    });
  }

  async activateUserSubscriptions(
    userId: string,
    subscriptions: SubscriptionSummary[],
  ): Promise<User | null> {
    return this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const user = await userRepo.findOne({ where: { id: userId } });
      if (!user) return null;
      user.is_license_active = true;
      user.subscriptions = subscriptions;
      return userRepo.save(user);
    });
  }
}
