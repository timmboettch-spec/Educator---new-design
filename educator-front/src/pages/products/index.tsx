import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import {
  GetEducatorByUserRequest,
  selectGetEducatorsData,
} from "../../redux/educator/GetEducatorRedux";
import { Box, Cpu, Package, Plus, TrendingUp } from "lucide-react";
import { Button } from "../../components/ui/Button";
import SeatsCard from "../../components/myproducts/seatscard";
import ProductEntitlements from "../../components/myproducts/ProductEntitlements";
import SimulationBundles from "../../components/myproducts/SimulationBundles";
import { getParsedUser, updateStoredUser } from "../../utils/storage";
import { getCurrentUserRequest } from "../../redux/users/GetUserRedux";
import type { AppDispatch } from "../../store/index";
import type { Subscription } from "../../types";
import Hardware from "../../components/myproducts/Hardware";
import { ProductSimBundleRequest } from "@/redux/products/simbundle";
import loginEn from "../../locales/auth/login/en.json";
import loginEs from "../../locales/auth/login/es.json";

type SupportedLang = "en" | "es";

const LANGUAGE_STORAGE_KEY = "app_language";

const getStoredLanguage = (): SupportedLang => {
  if (typeof window === "undefined") {
    return "en";
  }

  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)?.toLowerCase();
  return saved === "es" ? "es" : "en";
};

function getRoleName(userData: Record<string, unknown>): string {
  const r = userData?.role;
  return (
    typeof r === "string"
      ? r
      : ((r as Record<string, unknown>)?.role_name as string) ?? ""
  ).toLowerCase();
}

function isEducatorUser(userData: Record<string, unknown>): boolean {
  const roleName = getRoleName(userData);
  if (roleName === "educator") {
    return true;
  }

  const hasLicenseFlag = Object.prototype.hasOwnProperty.call(userData, "is_license_active");
  const hasAdminRelation =
    typeof userData.admin === "object" && userData.admin !== null;
  const hasEducatorTokenFields =
    Object.prototype.hasOwnProperty.call(userData, "tokens") ||
    Object.prototype.hasOwnProperty.call(userData, "allocated_tokens") ||
    Object.prototype.hasOwnProperty.call(userData, "total_tokens");

  return !hasLicenseFlag && (hasAdminRelation || hasEducatorTokenFields);
}

function computeSeats(userData: Record<string, unknown>, subs: Subscription[]) {
  const debug = (_label: string, _payload: Record<string, unknown>) => { /* no-op */ };

  if (subs.some((s) => s.ai_seats != null)) {
    const totalSeats = subs.reduce((s, sub) => s + (sub.ai_seats ?? 0), 0);
    const availableSeats = subs.reduce(
      (s, sub) => s + (sub.seats_available ?? 0),
      0,
    );
    debug("Subscription seat path", {
      totalSeats,
      availableSeats,
      usedSeats: totalSeats - availableSeats,
      subscriptionCount: subs.length,
    });
    return { totalSeats, usedSeats: totalSeats - availableSeats, availableSeats };
  }

  const totalTokensRaw = Number(userData?.total_tokens);
  const allocatedRaw = Number(userData?.allocated_tokens);
  const availableRaw = Number(userData?.tokens);
  const totalTokens = Number.isFinite(totalTokensRaw) ? totalTokensRaw : null;
  const allocatedTokens = Number.isFinite(allocatedRaw) ? allocatedRaw : 0;
  const availableSeats = Number.isFinite(availableRaw) ? availableRaw : 0;
  const totalSeats = totalTokens ?? availableSeats + allocatedTokens;
  const usedSeats = Math.max(0, totalSeats - availableSeats);

  debug("Token seat path", {
    total_tokens: userData?.total_tokens,
    allocated_tokens: userData?.allocated_tokens,
    tokens: userData?.tokens,
    computed: { totalSeats, usedSeats, availableSeats },
  });

  return { totalSeats, usedSeats, availableSeats };
}

function isSubActive(sub: Subscription): boolean {
  if (!sub.end) return true;
  return new Date(sub.end) > new Date();
}

function isHardwareProduct(name: string, platform = ""): boolean {
  return /manikin|device|hardware/i.test(name) || /device/i.test(platform);
}

function isSimulationBundleProduct(name: string, platform = ""): boolean {
  return /bundle/i.test(name) || /bundle/i.test(platform);
}

function parseLeadingQuantity(value: string): { quantity: number; cleanName: string } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)\s+(.+)$/);
  if (!match) {
    return { quantity: 1, cleanName: trimmed };
  }
  return {
    quantity: Number(match[1]) || 1,
    cleanName: match[2].trim(),
  };
}

function parseDeviceEntry(deviceEntry: unknown): { quantity: number; productLabel: string } {
  if (typeof deviceEntry !== "string") {
    return { quantity: 1, productLabel: "" };
  }
  const parsed = parseLeadingQuantity(deviceEntry);
  return { quantity: parsed.quantity, productLabel: parsed.cleanName };
}

function getHardwareQuantityForProduct(sub: Subscription, productName: string): number {
  const devices = Array.isArray(sub.devices_registered) ? sub.devices_registered : [];
  const normalizedProduct = productName.toLowerCase().trim();

  let matched = 0;
  devices.forEach((entry) => {
    const parsed = parseDeviceEntry(entry);
    const normalizedLabel = parsed.productLabel.toLowerCase();
    if (
      normalizedLabel &&
      (normalizedLabel.includes(normalizedProduct) || normalizedProduct.includes(normalizedLabel))
    ) {
      matched += parsed.quantity;
    }
  });

  if (matched > 0) {
    return matched;
  }

  return parseLeadingQuantity(productName).quantity;
}

function countActiveHardware(subscriptions: Subscription[]): number {
  return subscriptions.filter(isSubActive).reduce((sum, sub) => {
    const names = sub.product_name ?? [];
    const platform = sub.platform ?? [];
    const hardwareCount = names.reduce((count, name: string, index: number) => {
      const platformStr = platform[index] ?? "";
      if (!isHardwareProduct(name, platformStr)) {
        return count;
      }
      return count + getHardwareQuantityForProduct(sub, name);
    }, 0);
    return sum + hardwareCount;
  }, 0);
}

function isAiSeatProduct(productName: string): boolean {
  const lower = productName.toLowerCase();
  return /ai\s*simulation\s*seats?|simulation\s*seats?|\bai\b.*\bseats?\b|\bseats?\b.*\bai\b/.test(lower);
}

function normalizeBundleKey(name: string): string {
  return name.toLowerCase().replace(/[_\s]+/g, "_").replace(/[^a-z0-9_]/g, "");
}

function toBundleApiName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .replace(/(^|_)([a-z])/g, (_, sep: string, chr: string) => `${sep}${chr.toUpperCase()}`);
}

export default function MyProducts() {
  const dispatch = useDispatch<AppDispatch>();
  const cachedUser = getParsedUser() ?? {};
  const [userData, setUserData] = useState<Record<string, unknown>>(cachedUser);
  // Header slot that ProductEntitlements portals its attention tile into.
  const [attentionSlot, setAttentionSlot] = useState<HTMLDivElement | null>(null);
  const [bundleSimulationMap, setBundleSimulationMap] = useState<
    Record<string, { unit_id: string; simulations: Record<string, unknown>[] }>
  >({});
  const language = getStoredLanguage();
  const locale = language === "es" ? loginEs : loginEn;
  const productsCopy = {
    title: locale?.products?.title ?? "Products",
    subtitle:
      locale?.products?.subtitle ?? "Manage your owned systems and simulation libraries",
    totalSeats: locale?.products?.totalSeats ?? "Total Seats",
    usedSeats: locale?.products?.usedSeats ?? "Used Seats",
    availableSeats: locale?.products?.availableSeats ?? "Available Seats",
    totalProducts: locale?.products?.totalProducts ?? "Total Products",
    activeHardware: locale?.products?.activeHardware ?? "Active Hardware",
    percentUtilizedSuffix: locale?.products?.percentUtilizedSuffix ?? "utilized",
    percentRemainingSuffix: locale?.products?.percentRemainingSuffix ?? "remaining",
    simulations: locale?.products?.simulations ?? "Simulations",
    bundleSingular: locale?.products?.bundleSingular ?? "bundle",
    bundlePlural: locale?.products?.bundlePlural ?? "bundles",
    simulationSingular: locale?.products?.simulationSingular ?? "simulation",
    simulationPlural: locale?.products?.simulationPlural ?? "simulations",
    hardware: locale?.products?.hardware ?? "Hardware",
    statusActive: locale?.products?.statusActive ?? "Active",
    statusNotAssigned: locale?.products?.statusNotAssigned ?? "Not Assigned",
    classes: locale?.products?.classes ?? "Classes",
    itemSingular: locale?.products?.itemSingular ?? "item",
    itemPlural: locale?.products?.itemPlural ?? "items",
    productLabel: locale?.products?.productLabel ?? "PRODUCT",
    viewDetails: locale?.products?.viewDetails ?? "View Details",
    viewMore: locale?.products?.viewMore ?? "View More",
    viewLess: locale?.products?.viewLess ?? "View Less",
    moreSuffix: locale?.products?.moreSuffix ?? "more",
    noSimulationsInBundle:
      locale?.products?.noSimulationsInBundle ??
      "No simulations available for this bundle yet.",
    noBundlesFound:
      locale?.products?.noBundlesFound ?? "No simulation bundles found.",
    bundlesAutoAppear:
      locale?.products?.bundlesAutoAppear ??
      "Purchased bundles will appear here automatically.",
    manageSeats: locale?.products?.manageSeats ?? "Manage Seats",
  };
  const isAdmin = !isEducatorUser(userData);
  const navigate = useNavigate();
  const location = useLocation();
  // Deep-link from the dashboard Usage Monitoring: pre-filter the products table
  // to the clicked product's entitlement key, or to an attention subset.
  const navState = location.state as
    | {
        productKey?: string;
        attention?: "expiring" | "low" | "active" | "expired";
        assoc?: "none" | "some";
      }
    | null;
  const initialProductSearch = navState?.productKey ?? "";
  const initialAttention = navState?.attention ?? "";
  const initialAssoc = navState?.assoc ?? "";

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await dispatch(getCurrentUserRequest()).unwrap();
        if (res?.data) {
          const fresh = res.data as unknown as Record<string, unknown>;
          updateStoredUser(fresh);
          setUserData(fresh);
        }
      } catch {
        return;
      }
    };
    fetchUser();
  }, [dispatch]);

  // Educators are offered as options for associating a product to where it's
  // used (admin-local notes only — no entitlement impact).
  const { items: educators } = useSelector(selectGetEducatorsData);
  useEffect(() => {
    dispatch(GetEducatorByUserRequest());
  }, [dispatch]);
  const educatorOptions = useMemo(
    () =>
      [...educators]
        .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""))
        .map((e) => ({
          value: e.id,
          label: e.full_name || e.educator_name || e.email || "Unknown",
        })),
    [educators],
  );

  const subscriptions = useMemo<Subscription[]>(
    () => (userData?.subscriptions as Subscription[]) ?? [],
    [userData],
  );

  const adminSubscriptions = useMemo<Subscription[]>(() => {
    const admin = userData?.admin as Record<string, unknown> | undefined;
    const subs = admin?.subscriptions;
    return Array.isArray(subs) ? (subs as Subscription[]) : [];
  }, [userData]);

  const displaySubscriptions = useMemo<Subscription[]>(() => {
    if (isAdmin) {
      return subscriptions;
    }
    return adminSubscriptions.length > 0 ? adminSubscriptions : subscriptions;
  }, [isAdmin, subscriptions, adminSubscriptions]);

  const { totalSeats, usedSeats, availableSeats } = useMemo(
    () => computeSeats(userData, subscriptions),
    [userData, subscriptions],
  );

  const totalProducts = displaySubscriptions.reduce((sum, sub) => {
    const names = sub.product_name ?? [];
    const platform = sub.platform ?? [];

    const subTotal = names.reduce((count, name, index) => {
      const platformStr = platform[index] ?? "";

      if (isHardwareProduct(name, platformStr)) {
        return count + getHardwareQuantityForProduct(sub, name);
      }

      if (isSimulationBundleProduct(name, platformStr)) {
        return count + parseLeadingQuantity(name).quantity;
      }

      return count + 1;
    }, 0);

    return sum + subTotal;
  }, 0);
  const activeHardware = countActiveHardware(displaySubscriptions);

  const bundleProductNames = useMemo<string[]>(() => {
    const bundles: string[] = [];

    displaySubscriptions.forEach((sub) => {
      (sub.product_name ?? []).forEach((name, index) => {
        const platformStr = sub.platform?.[index] ?? "";
        const isHardware = isHardwareProduct(name, platformStr);
        const isAiSeat = isAiSeatProduct(name);
        const isSimulationBundle = isSimulationBundleProduct(name, platformStr);
        const parsed = parseLeadingQuantity(name);

        if (!isHardware && !isAiSeat && isSimulationBundle) {
          for (let i = 0; i < parsed.quantity; i += 1) {
            bundles.push(parsed.cleanName || name);
          }
        }
      });
    });

    return Array.from(new Set(bundles));
  }, [displaySubscriptions]);

  const usedPct = totalSeats > 0 ? Math.round((usedSeats / totalSeats) * 100) : 0;
  const availablePct = totalSeats > 0 ? 100 - usedPct : 0;
  const bundleNamesKey = bundleProductNames.join('|');
  useEffect(() => {
    if (bundleProductNames.length === 0) {
      setBundleSimulationMap({});
      return;
    }

    let cancelled = false;

    const fetchBundles = async () => {
      try {
        const nextMap: Record<string, { unit_id: string; simulations: Record<string, unknown>[] }> = {};

        await Promise.all(
          bundleProductNames.map(async (bundleName) => {
            try {
              const apiBundleName = toBundleApiName(bundleName);
              const res = await dispatch(
                ProductSimBundleRequest({ bundle_name: apiBundleName }),
              ).unwrap();
              const bundleData = res.data as unknown as { unit_id?: string; simulations?: Record<string, unknown>[] };

              nextMap[normalizeBundleKey(bundleName)] = {
                unit_id: bundleData.unit_id ?? '',
                simulations: Array.isArray(bundleData.simulations) ? bundleData.simulations : [],
              };
            } catch {
              nextMap[normalizeBundleKey(bundleName)] = { unit_id: '', simulations: [] };
            }
          }),
        );

        if (!cancelled) {
          setBundleSimulationMap(nextMap);
        }
      } catch {
        // fetch failed silently
      }
    };

    fetchBundles();

    return () => {
      cancelled = true;
    };
  }, [bundleNamesKey, dispatch]);


  return (
    <div className="p-4 sm:p-6 min-h-screen font-sans text-text-primary">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-[28px] font-semibold text-primary-500 break-words">{productsCopy.title}</h1>
        </div>
        {/* The "products needing attention" tile is portaled here from
            ProductEntitlements so it sits between the title and the action button
            (like the Schools / Educators pages), adding no full-width row. */}
        <div
          ref={setAttentionSlot}
          className="order-last w-full lg:order-none lg:w-auto lg:flex-1 lg:max-w-xl lg:px-2 empty:hidden"
        />
        {isAdmin && (
          <Button
            onClick={() => navigate('/redeem')}
            variant="gradient"
            size="lg"
            className="flex items-center gap-2 rounded-full shadow-md"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Add Entitlement Key
          </Button>
        )}
      </div>

      <ProductEntitlements
        subscriptions={displaySubscriptions}
        initialSearch={initialProductSearch}
        initialAttention={initialAttention}
        initialAssoc={initialAssoc}
        educatorOptions={educatorOptions}
        attentionSlot={attentionSlot}
      />
    </div>
  );
}
