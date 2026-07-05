import { describe, it, expect } from 'vitest';
import { parseBackendRoomTypes, buildRoomPayload, normalizeRatePlans } from '../utils/roomMapper';

describe('roomMapper', () => {
  describe('parseBackendRoomTypes', () => {
    it('should correctly parse an empty array', () => {
      expect(parseBackendRoomTypes([])).toEqual([]);
      expect(parseBackendRoomTypes(null)).toEqual([]);
    });

    it('should parse complex room sizes and bed types', () => {
      const mockBackendRooms = [
        {
          id: 'room-1',
          code: 'DEL-01',
          name: 'Deluxe Room',
          viewType: 'City View',
          roomSize: '300 Square Feet',
          totalInventory: 5,
          description: 'A nice room',
          bedType: '1x Queen Bed, 2x Twin Bed',
          extraBedAllowed: true,
          baseOccupancy: 2,
          maxOccupancy: 4,
          ratePlans: [
            { isActive: true, mealPlan: 'CP', basePrice: 2000, extraAdultPrice: 500, extraChildPrice: 250, id: 'rp-1' }
          ],
          amenities: ['TV', 'AC']
        }
      ];

      const parsed = parseBackendRoomTypes(mockBackendRooms);
      
      expect(parsed).toHaveLength(1);
      const room = parsed[0];
      expect(room.id).toBe('room-1');
      expect(room.code).toBe('DEL-01');
      expect(room.size).toBe('300');
      expect(room.sizeUnit).toBe('Square Feet');
      expect(room.count).toBe(5);
      
      // Bed parsing
      expect(room.beds).toHaveLength(2);
      expect(room.beds[0]).toEqual({ count: 1, type: 'Queen Bed' });
      expect(room.beds[1]).toEqual({ count: 2, type: 'Twin Bed' });

      // Occupancy
      expect(room.baseAdults).toBe(2);
      expect(room.maxAdults).toBe(4);
      expect(room.maxOccupancy).toBe(4);
      expect(room.allowExtraBed).toBe('Yes');

      // Rate Plan
      expect(room.mealPlan).toBe('FREE Breakfast'); // CP -> FREE Breakfast
      expect(room.basePrice).toBe(2000);
      expect(room.extraAdultPrice).toBe(500);
      expect(room.childPrice).toBe(250);
      expect(room.ratePlanId).toBe('rp-1');
    });
  });

  describe('buildRoomPayload', () => {
    it('should generate a valid payload from frontend state', () => {
      const mockFrontendRoom = {
        name: 'Standard Room',
        code: 'STD-123',
        description: 'Standard description',
        maxOccupancy: '3',
        baseAdults: '2',
        count: '10',
        amenities: ['AC'],
        beds: [{ count: 1, type: 'King Bed' }],
        size: '250',
        sizeUnit: 'SqFt',
        view: 'Garden View',
        allowExtraBed: 'No'
      };

      const payload = buildRoomPayload(mockFrontendRoom, 'hotel-1', true);
      
      expect(payload.name).toBe('Standard Room');
      expect(payload.code).toBe('STD-123');
      expect(payload.description).toBe('Standard description');
      expect(payload.maxOccupancy).toBe(3);
      expect(payload.baseOccupancy).toBe(2);
      expect(payload.totalRooms).toBe(10);
      expect(payload.hotelId).toBe('hotel-1');
      expect(payload.amenities).toEqual(['AC']);
      expect(payload.bedType).toBe('1x King Bed');
      expect(payload.roomSize).toBe('250 SqFt');
      expect(payload.viewType).toBe('Garden View');
      expect(payload.extraBedAllowed).toBe(false);
      expect(payload.maxExtraBeds).toBe(0);
    });
  });

  describe('normalizeRatePlans', () => {
    it('should map frontend rate plans to backend requirements', () => {
      const mockFrontendRoom = {
        basePrice: '1500',
        mealPlan: 'Breakfast & Dinner',
        extraAdultPrice: '300',
        childPrice: '150'
      };

      const payload = normalizeRatePlans(mockFrontendRoom);

      expect(payload.basePrice).toBe(1500);
      expect(payload.mealPlan).toBe('MAP'); // Breakfast & Dinner -> MAP
      expect(payload.extraAdultPrice).toBe(300);
      expect(payload.extraChildPrice).toBe(150);
      expect(payload.mealPriceAdult).toBe(0);
      expect(payload.mealPriceChild).toBe(0);
    });
  });
});
