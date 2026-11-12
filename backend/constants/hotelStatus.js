/**
 * Hotel statuses that mean "visible and bookable by the public".
 * The admin go-live flow sets LIVE; older/admin-edited hotels use ACTIVE.
 * Use this everywhere public listings, search, recommendations and "live" counts are computed.
 */
export const PUBLIC_HOTEL_STATUSES = ['LIVE', 'ACTIVE'];
