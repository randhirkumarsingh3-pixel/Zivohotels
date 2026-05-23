import prisma from './db.js';

let configCache = null;
let lastFetch = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

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
