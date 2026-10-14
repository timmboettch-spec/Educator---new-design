import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardCardState } from '@/hooks/useDashboardCardState';
import {
  buildAvatarUsage,
  groupProducts,
  hardwareHours,
  sumHours,
  type DashboardProduct,
  type ProductEdition,
} from '@/utils/dashboardProducts';
import { ProductSection } from './ProductSection';
import { UsageBar } from './UsageBar';

interface MyProductsUsageProps {
  /** The educator's active products (placeholders until a products API exists). */
  products: DashboardProduct[];
  /** The educator's real avatar seats (from /api/auth/me). */
  seats: { total: number; consumed: number; available: number };
  onRequestSeats: () => void;
}

const EDITIONS: ProductEdition[] = ['secondary', 'postSecondary'];

const SUB_TOGGLE_CLASSES =
  'w-[calc(100%+2rem)] sm:w-[calc(100%+2.5rem)] flex items-center justify-between gap-2 text-left py-2 -mx-4 sm:-mx-5 px-4 sm:px-5 hover:bg-[#e9e9e9]/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400';

function Chevron({ open, size }: { open: boolean; size: number }) {
  return (
    <ChevronDown
      size={size}
      aria-hidden="true"
      className={cn(
        'text-gray-500 shrink-0 transition-transform duration-200',
        !open && '-rotate-90'
      )}
    />
  );
}

/** A collapsible sub-block (Associated Products, My Usage, each breakdown). */
function SubSection({
  title,
  open,
  onToggle,
  headingClassName,
  chevronSize,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  headingClassName: string;
  chevronSize: number;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={SUB_TOGGLE_CLASSES}
      >
        <h3 className={cn('m-0', headingClassName)}>{title}</h3>
        <Chevron open={open} size={chevronSize} />
      </button>
      {open && children}
    </div>
  );
}

/**
 * Educator dashboard "My Products & Usage": the active associated products by edition
 * (avatar / workstation), and seat and hours usage. Seat totals are real; products,
 * the edition split and hours are placeholders until a products API exists (noted
 * on screen). Collapsed by default.
 */
export function MyProductsUsage({
  products,
  seats,
  onRequestSeats,
}: MyProductsUsageProps) {
  const { t, i18n } = useTranslation('dashboard');
  const locale = i18n.language.startsWith('es') ? 'es-ES' : 'en-US';

  const [open, setOpen] = useDashboardCardState('products', false);
  const [productsOpen, setProductsOpen] = useState(true);
  const [usageOpen, setUsageOpen] = useState(true);
  const [avatarOpen, setAvatarOpen] = useState(true);
  const [workstationOpen, setWorkstationOpen] = useState(true);

  const groups = useMemo(() => groupProducts(products), [products]);
  const avatarCount = products.filter((p) => p.kind === 'avatar').length;
  const workstationCount = products.length - avatarCount;
  const avatarUsage = buildAvatarUsage(seats, groups);
  const secondaryHardware = hardwareHours(groups.secondary.workstation);
  const postHardware = hardwareHours(groups.postSecondary.workstation);
  const secondaryHardwareTotal = sumHours(secondaryHardware);
  const postHardwareTotal = sumHours(postHardware);

  const seatsUnit = t('productsUsage.usage.seats');
  const hoursUnit = t('productsUsage.usage.hours');
  const groupHeading =
    'text-sm font-semibold uppercase tracking-wide text-[#db8833]';

  const toggle = () => {
    // Opening the section shows every sub-block, as in the design.
    if (!open) {
      setProductsOpen(true);
      setUsageOpen(true);
      setAvatarOpen(true);
      setWorkstationOpen(true);
    }
    setOpen((isOpen) => !isOpen);
  };

  const requestSeatsButton = (
    <button
      type="button"
      onClick={onRequestSeats}
      className="inline-flex items-center gap-1 text-xs font-semibold text-white bg-gradient-btn hover:opacity-90 rounded-full px-3 py-1.5 transition-opacity whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-1"
    >
      {t('productsUsage.requestMoreSeats')}
    </button>
  );

  const hardwareRows = (
    rows: ReturnType<typeof hardwareHours>,
    edition: ProductEdition
  ) =>
    rows.length > 0 && (
      <div className="pl-4 space-y-3">
        {rows.map((row) => (
          <UsageBar
            key={`${edition}-${row.key}`}
            label={t('productsUsage.usage.productHours', { name: row.name })}
            used={row.used}
            total={row.total}
            unit={hoursUnit}
            locale={locale}
            indent
          />
        ))}
      </div>
    );

  return (
    <section
      id="my-products-usage"
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden"
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-4 sm:px-5 min-h-[44px] text-left hover:bg-[#e9e9e9]/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
      >
        <h2 className="text-sm sm:text-base font-semibold text-gray-800 m-0">
          {t('productsUsage.title')}
        </h2>
        <Chevron open={open} size={20} />
      </button>

      {open && (
        <div className="px-4 sm:px-5 pb-5 pt-4 border-t border-gray-100 space-y-5">
          {products.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              {t('productsUsage.empty')}
            </p>
          ) : (
            <SubSection
              title={t('productsUsage.associated', { count: products.length })}
              open={productsOpen}
              onToggle={() => setProductsOpen((o) => !o)}
              headingClassName="text-sm sm:text-base font-semibold text-gray-800"
              chevronSize={18}
            >
              <p className="text-sm text-gray-500 mb-3">
                {t('productsUsage.associatedSummary', {
                  avatar: avatarCount,
                  workstation: workstationCount,
                })}
              </p>
              {/* One grid of edition columns × (header, avatar, workstation) rows, so
                  each row lines up across both columns; editions stay in order on
                  narrow screens. */}
              <div className="relative grid grid-cols-1 gap-x-6 gap-y-4 items-start lg:grid-cols-2 lg:grid-flow-col lg:grid-rows-[auto_auto_auto]">
                <div
                  aria-hidden="true"
                  className="hidden lg:block absolute inset-y-0 left-1/2 w-px bg-gray-200"
                />
                {EDITIONS.map((edition) => {
                  const editionGroups = groups[edition];
                  const count =
                    editionGroups.avatar.length +
                    editionGroups.workstation.length;
                  return (
                    <div key={edition} className="contents">
                      <h3 className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-1.5 m-0">
                        {t(`productsUsage.editions.${edition}`)}{' '}
                        <span className="font-normal text-gray-500">
                          ({count})
                        </span>
                      </h3>
                      <div className="min-w-0">
                        <ProductSection
                          title={t('productsUsage.avatarGroup')}
                          products={editionGroups.avatar}
                          locale={locale}
                          action={requestSeatsButton}
                        />
                      </div>
                      <div className="min-w-0">
                        <ProductSection
                          title={t('productsUsage.workstationGroup')}
                          products={editionGroups.workstation}
                          locale={locale}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </SubSection>
          )}

          <div className="border-t border-gray-100 pt-5">
            <SubSection
              title={t('productsUsage.usage.title')}
              open={usageOpen}
              onToggle={() => setUsageOpen((o) => !o)}
              headingClassName="text-sm sm:text-base font-semibold text-gray-800"
              chevronSize={18}
            >
              <div className="space-y-4">
                <SubSection
                  title={t('productsUsage.usage.avatarBreakdown')}
                  open={avatarOpen}
                  onToggle={() => setAvatarOpen((o) => !o)}
                  headingClassName={groupHeading}
                  chevronSize={16}
                >
                  <div className="space-y-3 text-sm">
                    <p className="text-gray-600">
                      {t('productsUsage.usage.remainingSeats')}{' '}
                      <span className="font-semibold text-primary-500 tabular-nums">
                        {avatarUsage.remainingSeats.toLocaleString(locale)}
                      </span>
                    </p>
                    <UsageBar
                      label={t('productsUsage.usage.totalAvatarSeats')}
                      used={avatarUsage.seats.used}
                      total={avatarUsage.seats.total}
                      unit={seatsUnit}
                      locale={locale}
                      bold
                    />
                    {groups.secondary.avatar.length > 0 && (
                      <UsageBar
                        label={t('productsUsage.usage.secondaryAvatarSeats')}
                        used={avatarUsage.secondarySeats.used}
                        total={avatarUsage.secondarySeats.total}
                        unit={seatsUnit}
                        locale={locale}
                        indent
                      />
                    )}
                    {groups.postSecondary.avatar.length > 0 && (
                      <UsageBar
                        label={t(
                          'productsUsage.usage.postSecondaryAvatarSeats'
                        )}
                        used={avatarUsage.postSecondarySeats.used}
                        total={avatarUsage.postSecondarySeats.total}
                        unit={seatsUnit}
                        locale={locale}
                        indent
                      />
                    )}
                    {groups.secondary.avatar.length > 0 && (
                      <UsageBar
                        label={t('productsUsage.usage.secondaryAvatarHours')}
                        used={avatarUsage.secondaryHours}
                        total={0}
                        unit={hoursUnit}
                        locale={locale}
                        barless
                      />
                    )}
                    {groups.postSecondary.avatar.length > 0 && (
                      <UsageBar
                        label={t(
                          'productsUsage.usage.postSecondaryAvatarHours'
                        )}
                        used={avatarUsage.postSecondaryHours}
                        total={0}
                        unit={hoursUnit}
                        locale={locale}
                        barless
                      />
                    )}
                  </div>
                </SubSection>

                {workstationCount > 0 && (
                  <div className="border-t border-gray-200 pt-4">
                    <SubSection
                      title={t('productsUsage.usage.workstationBreakdown')}
                      open={workstationOpen}
                      onToggle={() => setWorkstationOpen((o) => !o)}
                      headingClassName={groupHeading}
                      chevronSize={16}
                    >
                      <div className="space-y-3 text-sm">
                        <UsageBar
                          label={t('productsUsage.usage.totalWorkstation')}
                          used={
                            secondaryHardwareTotal.used + postHardwareTotal.used
                          }
                          total={0}
                          unit={hoursUnit}
                          locale={locale}
                          bold
                          barless
                        />
                        {secondaryHardware.length > 0 && (
                          <UsageBar
                            label={t(
                              'productsUsage.usage.secondaryWorkstationHours'
                            )}
                            used={secondaryHardwareTotal.used}
                            total={0}
                            unit={hoursUnit}
                            locale={locale}
                            indent
                            barless
                          />
                        )}
                        {hardwareRows(secondaryHardware, 'secondary')}
                        {postHardware.length > 0 && (
                          <UsageBar
                            label={t(
                              'productsUsage.usage.postSecondaryWorkstationHours'
                            )}
                            used={postHardwareTotal.used}
                            total={0}
                            unit={hoursUnit}
                            locale={locale}
                            indent
                            barless
                          />
                        )}
                        {hardwareRows(postHardware, 'postSecondary')}
                      </div>
                    </SubSection>
                  </div>
                )}

                <p className="text-xs text-red-600 bg-[#e9e9e9] rounded-md px-3 py-2">
                  {t('productsUsage.usage.placeholderNote')}
                </p>
              </div>
            </SubSection>
          </div>
        </div>
      )}
    </section>
  );
}
