import prisma from './db.js';

let configCache = null;
let lastFetch = 0;
// Short, because the safety switches (maintenance, pause bookings or payments) are read from here
// and must reach every server process within seconds of being turned on.
const CACHE_TTL = 5 * 1000;

/** Forget the cached copy (this process), e.g. right after an admin changes a switch. */
export const clearSystemConfigCache = () => { configCache = null; lastFetch = 0; };

export const getSystemConfig = async () => {
  const now = Date.now();
  if (configCache && (now - lastFetch < CACHE_TTL)) {
    return configCache;
  }

  try {
    const configs = await prisma.systemConfig.findMany();
    const configMap = configs.reduce((acc, curr) => {
      acc[curr.key] = curr.value;
      return acc;
    }, {});

    // Provide safe defaults if missing in DB
    const finalConfig = {
      partialPaymentPercent: configMap.partialPaymentPercent ?? 30,
      prepaidDiscountPercent: configMap.prepaidDiscountPercent ?? 5,
      maintenanceMode: configMap.maintenanceMode ?? false,
      isBookingDisabled: configMap.isBookingDisabled ?? false,
      ...configMap
    };

    configCache = finalConfig;
    lastFetch = now;
    return finalConfig;
  } catch (error) {
    console.error('Failed to fetch system config, using defaults:', error.message);
    return {
      partialPaymentPercent: 30,
      prepaidDiscountPercent: 5,
      maintenanceMode: false,
      isBookingDisabled: false
    };
  }
};
