import { describe, it, expect } from 'vitest';
import { buildHotelPayload } from '../services/onboardingMapper';

describe('onboardingMapper - buildHotelPayload', () => {
  it('should map all fields correctly for a standard Admin payload', () => {
    const mockFormData = {
      name: 'Test Hotel',
      type: 'Resort',
      address: '123 Test St',
      city: 'Test City',
      state: 'Test State',
      country: 'Test Country',
      area: 'Test Area',
      pincode: '123456',
      description: 'A test property',
      latitude: '12.34',
      longitude: '56.78',
      rating: '4',
      images: [
        { url: 'https://test.com/img1.jpg', tags: ['exterior'] },
        { url: 'blob:some-blob-url', tags: ['lobby'] }
      ],
      amenities: ['WIFI', 'POOL'],
      policies: ['NO_PETS'],
      checkInTime: '14:00',
      checkOutTime: '11:00',
      guestMobile: '9876543210',
      guestEmail: 'guest@test.com',
      receptionPhone: '9876543210',
      receptionEmail: 'reception@test.com',
      managerName: 'Test Manager',
      managerPhone: '9876543211',
      managerEmail: 'manager@test.com',
      guestLandline: '080-123456',
      hasChannelManager: true,
      channelManagerName: 'TestChannel',
      ownerName: 'Test Owner',
      ownerEmail: 'owner@test.com',
      ownerPhone: '9876543212',
      legalName: 'Test Hotel Pvt Ltd',
      pan: 'ABCDE1234F',
      gstin: '29ABCDE1234F1Z5',
      msme: 'MSME123',
      incorporationType: 'Private Limited',
      payoutCycle: 'WEEKLY',
      builtYear: '2020',
      bookingSince: '2021',
      accountNumber: '1234567890',
      accountName: 'Test Account',
      bankName: 'Test Bank',
      ifscCode: 'TEST0001234',
      branchName: 'Test Branch',
      commission: '15'
    };

    const VITE_API_URL = 'http://localhost:5000/api/v1';

    const payload = buildHotelPayload(mockFormData, VITE_API_URL);

    // Assert parity with required structure
    expect(payload.name).toBe('Test Hotel');
    expect(payload.propertyType).toBe('Resort');
    expect(payload.address).toBe('123 Test St');
    expect(payload.location).toBe('123 Test St');
    expect(payload.city).toBe('Test City');
    expect(payload.state).toBe('Test State');
    expect(payload.country).toBe('Test Country');
    expect(payload.area).toBe('Test Area');
    expect(payload.pincode).toBe('123456');
    expect(payload.description).toBe('A test property');
    expect(payload.latitude).toBe('12.34');
    expect(payload.longitude).toBe('56.78');
    expect(payload.rating).toBe('4');

    expect(payload.media).toHaveLength(1);
    expect(payload.media[0].url).toBe('https://test.com/img1.jpg');
    
    expect(payload.amenities).toEqual(['WIFI', 'POOL']);
    expect(payload.policies).toEqual(['NO_PETS']);
    expect(payload.checkInTime).toBe('14:00');
    expect(payload.checkOutTime).toBe('11:00');

    expect(payload.receptionPhone).toBe('9876543210');
    expect(payload.receptionEmail).toBe('guest@test.com');
    expect(payload.managerName).toBe('Test Manager');
    expect(payload.managerPhone).toBe('9876543211');
    expect(payload.managerEmail).toBe('manager@test.com');
    expect(payload.guestLandline).toBe('080-123456');
    expect(payload.channelProvider).toBe('TestChannel');

    expect(payload.ownerName).toBe('Test Owner');
    expect(payload.ownerEmail).toBe('owner@test.com');
    expect(payload.ownerPhone).toBe('9876543212');

    expect(payload.legalName).toBe('Test Hotel Pvt Ltd');
    expect(payload.pan).toBe('ABCDE1234F');
    expect(payload.gstin).toBe('29ABCDE1234F1Z5');
    expect(payload.msme).toBe('MSME123');
    expect(payload.incorporationType).toBe('Private Limited');
    expect(payload.payoutCycle).toBe('WEEKLY');
    expect(payload.builtYear).toBe('2020');
    expect(payload.bookingSince).toBe('2021');

    expect(payload.bankDetail).toBeDefined();
    expect(payload.bankDetail.accountName).toBe('Test Account');
    expect(payload.bankDetail.bankName).toBe('Test Bank');
    expect(payload.bankDetail.accountNumber).toBe('1234567890');
    expect(payload.bankDetail.ifscCode).toBe('TEST0001234');
    expect(payload.bankDetail.branchName).toBe('Test Branch');

    expect(payload.commissionRate).toBe(15);
  });

  it('should fall back to safe defaults when fields are missing', () => {
    const emptyPayload = buildHotelPayload({}, 'http://test');
    expect(emptyPayload.description).toBe('');
    expect(emptyPayload.media).toEqual([]);
    expect(emptyPayload.receptionPhone).toBe('');
    expect(emptyPayload.receptionEmail).toBe('');
    expect(emptyPayload.managerName).toBe('');
    expect(emptyPayload.channelProvider).toBe('NONE');
    expect(emptyPayload.bankDetail).toBeUndefined();
    expect(emptyPayload.commissionRate).toBeUndefined();
  });
});
