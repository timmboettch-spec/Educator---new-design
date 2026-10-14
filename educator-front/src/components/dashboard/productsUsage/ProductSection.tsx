import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatProductDate,
  type DashboardProduct,
} from '@/utils/dashboardProducts';

interface ProductSectionProps {
  title: string;
  products: DashboardProduct[];
  locale: string;
  /** e.g. the avatar group's "Request More Seats". */
  action?: ReactNode;
}

/** One avatar or workstation group within an edition column of My Products. */
export function ProductSection({
  title,
  products,
  locale,
  action,
}: ProductSectionProps) {
  const { t } = useTranslation('dashboard');

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="text-sm font-semibold uppercase tracking-wide text-[#db8833] m-0">
          {title} <span className="text-gray-500">({products.length})</span>
        </h4>
        {action}
      </div>
      {products.length === 0 ? (
        <p className="text-xs text-gray-500">
          {t('productsUsage.noneInGroup')}
        </p>
      ) : (
        <ul className="space-y-2">
          {products.map((product) => (
            <li
              key={product.key}
              className="rounded-xl border border-gray-200 p-3 min-w-0 flex items-start gap-3"
            >
              <div className="w-11 h-11 flex-shrink-0 rounded-lg bg-[#e9e9e9] flex items-center justify-center overflow-hidden">
                <img
                  src="/assets/RealityworksAI_logo.svg"
                  alt=""
                  aria-hidden="true"
                  className="w-7 h-7 object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 break-words">
                  {product.name}
                </p>
                {product.kind === 'avatar' ? (
                  <p className="text-sm text-gray-600 mt-1">
                    {t('productsUsage.remainingSeats')}{' '}
                    <span className="font-semibold text-primary-500 tabular-nums">
                      {(product.remainingSeats ?? 0).toLocaleString(locale)}
                    </span>
                  </p>
                ) : (
                  product.hardware && (
                    <p className="text-sm text-gray-500 mt-1 break-words">
                      {t('productsUsage.associatedProduct')}{' '}
                      <span className="font-medium text-gray-700">
                        {product.hardware}
                      </span>
                    </p>
                  )
                )}
              </div>
              <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0 mt-0.5">
                {t('productsUsage.expires', {
                  date: formatProductDate(product.expiresOn, locale),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
