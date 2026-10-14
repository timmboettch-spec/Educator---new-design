import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, IsNull, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Educator } from 'src/database/entities';
import { CLASS_REPOSITORY } from 'src/database/tokens';
import { ClassRepository } from 'src/database/repositories';
import { MailService } from 'src/mail/mail.service';
import { RedisService } from 'src/redis/redis.service';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsConstants } from './notifications.constants';
import { resolveEducatorEmail } from 'src/common/utils/educator-identity.util';

interface DigestEntry {
  studentCode?: string;
  studentName: string;
  simulationTitle: string;
  className: string;
  scenarioId: string;
}

@Injectable()
export class NotificationDigestService implements OnModuleInit {
  private readonly logger = new Logger(NotificationDigestService.name);

  constructor(
    @InjectRepository(Educator)
    private readonly educatorRepo: Repository<Educator>,
    @Inject(CLASS_REPOSITORY)
    private readonly classRepo: ClassRepository,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly mailService: MailService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) { }

  /** Run the class date reminder check once at startup so it doesn't wait for the next 08:00 UTC slot. */
  onModuleInit(): void {
    void this.sendClassDateReminders().catch((err: unknown) =>
      this.logger.error(
        `[DigestService] startup class-date reminder check failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
  }

  @Cron('0 7 * * *') // daily at 07:00 UTC
  async sendDailyDigests(): Promise<void> {
    await this.sendDigests('daily');
  }

  @Cron('0 7 * * 1') // weekly on Monday 07:00 UTC
  async sendWeeklyDigests(): Promise<void> {
    await this.sendDigests('weekly');
  }

  @Cron('0 7 1,15 * *') // bi-weekly on the 1st and 15th at 07:00 UTC
  async sendBiweeklyDigests(): Promise<void> {
    await this.sendDigests('biweekly');
  }

  @Cron('0 7 1 * *') // monthly on the 1st at 07:00 UTC
  async sendMonthlyDigests(): Promise<void> {
    await this.sendDigests('monthly');
  }

  private async sendDigests(frequency: string): Promise<void> {
    const educators = await this.educatorRepo.find({
      where: { is_active: true },
      relations: { userRole: { user: true } },
    });

    for (const educator of educators) {
      const identifier = resolveEducatorEmail(educator);
      if (!identifier) continue;

      const digestKey = `email:digest:${educator.id}:${frequency}:reports`;
      const raw = await this.redisService.lrangeAndDel(digestKey);
      if (raw.length === 0) continue;

      const entries: DigestEntry[] = raw
        .map((r) => {
          try {
            return JSON.parse(r) as DigestEntry;
          } catch {
            return null;
          }
        })
        .filter((e): e is DigestEntry => e !== null);

      if (entries.length === 0) continue;

      const logoUrl = this.configService.get<string>('EMAIL_LOGO_URL') ?? '';
      try {
        await this.mailService.sendMail({
          to: identifier,
          subject: `Student Reports Available — ${frequency.charAt(0).toUpperCase() + frequency.slice(1)} Digest`,
          template: 'report-digest',
          context: {
            educatorName: educator.full_name?.trim() || identifier,
            reports: entries,
            frequency,
            logoUrl,
          },
        });
      } catch (err) {
        this.logger.error(
          `[DigestService] Failed to send ${frequency} digest to ${identifier}: ${err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  @Cron('0 8 * * *') // daily at 08:00 UTC — sends class start/end date reminders
  async sendClassDateReminders(): Promise<void> {
    const reminderDays = NotificationsConstants.DEFAULTS.DATE_REMINDER_DAYS;

    // Build UTC-safe date strings so timezone-shifted servers don't miss a day
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const windowUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + reminderDays));
    const todayStr = todayUTC.toISOString().slice(0, 10);
    const windowStr = windowUTC.toISOString().slice(0, 10);

    // Range query: any class starting/ending between today and today+reminderDays
    const [startingClasses, endingClasses] = await Promise.all([
      this.classRepo.find({
        where: { start_date: Between(todayStr, windowStr), is_active: true, deleted_at: IsNull() },
        relations: { educator: true },
      }),
      this.classRepo.find({
        where: { end_date: Between(todayStr, windowStr), is_active: true, deleted_at: IsNull() },
        relations: { educator: true },
      }),
    ]);

    for (const cls of startingClasses) {
      if (!cls.educator?.id || !cls.id || !cls.class_name || !cls.start_date) continue;
      // Dedup: one notification per class per start-date; TTL slightly over 1 day prevents duplicate on rapid restart
      const dedupKey = `class:start:reminded:${cls.id}:${cls.start_date}`;
      if (await this.redisService.get<number>(dedupKey)) continue;
      await this.notificationsGateway
        .notifyEducatorClassStartDateReminder(cls.educator.id, cls.id, cls.class_name, cls.start_date)
        .catch((err: unknown) =>
          this.logger.error(
            `[DigestService] class start reminder failed for class=${cls.id}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      await this.redisService.set(dedupKey, 1, 25 * 3600);
    }

    for (const cls of endingClasses) {
      if (!cls.educator?.id || !cls.id || !cls.class_name || !cls.end_date) continue;
      const dedupKey = `class:end:reminded:${cls.id}:${cls.end_date}`;
      if (await this.redisService.get<number>(dedupKey)) continue;
      await this.notificationsGateway
        .notifyEducatorClassEndDateReminder(cls.educator.id, cls.id, cls.class_name, cls.end_date)
        .catch((err: unknown) =>
          this.logger.error(
            `[DigestService] class end reminder failed for class=${cls.id}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      await this.redisService.set(dedupKey, 1, 25 * 3600);
    }
  }
}
