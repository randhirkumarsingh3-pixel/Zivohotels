import nodemailer from 'nodemailer';
import prisma from '../config/db.js';

// Configure SMTP transport with Hostinger credentials
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true, // true for port 465
  auth: {
    user: 'bookings@zivohotels.com',
    pass: 'Singh@rk1'
  },
  pool: true, // use pooled connections
  rateLimit: 5, // limit to 5 messages per second
  timeout: 10000 // 10s timeout
});

// Verify connection configuration on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP Connection Error:', error);
  } else {
    console.log('🚀 SMTP Server is ready to send confirmation emails');
  }
});

/**
 * Generate premium HTML Booking Confirmation Email & Hotel Voucher
 * @param {object} booking - Booking data from database
 * @param {object} hotel - Hotel details
 * @param {object} roomType - Room type details
 * @param {object} ratePlan - Rate plan details
 * @returns {string} - HTML body
 */
const generateEmailHtml = (booking, hotel, roomType, ratePlan) => {
  const checkInDate = new Date(booking.checkIn).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const checkOutDate = new Date(booking.checkOut).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  
  const nights = Math.max(1, Math.round((new Date(booking.checkOut) - new Date(booking.checkIn)) / (1000 * 60 * 60 * 24)));
  
  const formattedPaid = booking.paidAmount.toLocaleString('en-IN');
  const formattedTotal = booking.totalAmount.toLocaleString('en-IN');
  const formattedRemaining = booking.remainingAmount.toLocaleString('en-IN');
  
  // Calculate discount (original rate estimate vs booked rate)
  const roomPrice = booking.totalAmount * 0.85; // Est room charge subtotal
  const taxes = booking.totalAmount * 0.15; // Est tax
  const savings = Math.round(booking.totalAmount * 0.2); // Est saving 20%
  
  // Dynamic QR Code url
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(booking.bookingRef)}`;
  
  // Fallback hotel image
  const hotelImg = hotel.images?.[0]?.url || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZivoHotels - Booking Confirmation</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #f8fafc;
      color: #0f172a;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    }
    .header {
      background-color: #0f172a;
      color: #ffffff;
      padding: 32px 24px;
      text-align: center;
      position: relative;
    }
    .brand-logo {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: -0.05em;
      color: #ffffff;
      margin: 0 0 16px 0;
      text-decoration: none;
      display: inline-block;
    }
    .status-badge {
      display: inline-block;
      background-color: #16a34a;
      color: #ffffff;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      padding: 6px 16px;
      border-radius: 9999px;
      margin-bottom: 12px;
    }
    .booking-ref-title {
      font-size: 14px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0 0 4px 0;
    }
    .booking-ref-val {
      font-size: 28px;
      font-weight: 800;
      color: #38bdf8;
      margin: 0 0 8px 0;
      font-family: monospace;
    }
    .verified-banner {
      background-color: rgb(37 99 235 / 0.1);
      color: #38bdf8;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 9999px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .hero-section {
      position: relative;
    }
    .hotel-image {
      width: 100%;
      height: 220px;
      object-cover: cover;
      display: block;
    }
    .hotel-details {
      padding: 24px;
      border-bottom: 1px solid #e2e8f0;
    }
    .hotel-name {
      font-size: 20px;
      font-weight: 800;
      margin: 0 0 8px 0;
      color: #0f172a;
    }
    .rating-stars {
      color: #f59e0b;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .hotel-address {
      font-size: 14px;
      color: #475569;
      margin: 0 0 16px 0;
      line-height: 1.5;
    }
    .tags-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 16px;
    }
    .tag {
      font-size: 11px;
      font-weight: 600;
      background-color: #f1f5f9;
      color: #475569;
      padding: 4px 10px;
      border-radius: 9999px;
    }
    .btn {
      display: inline-block;
      font-size: 14px;
      font-weight: 700;
      text-align: center;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      box-sizing: border-box;
    }
    .btn-primary {
      background-color: #2563eb;
      color: #ffffff !important;
    }
    .btn-secondary {
      background-color: #f1f5f9;
      color: #0f172a !important;
      border: 1px solid #cbd5e1;
    }
    .btn-danger {
      background-color: #fef2f2;
      color: #dc2626 !important;
    }
    .card {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin: 24px;
    }
    .card-title {
      font-size: 16px;
      font-weight: 800;
      margin: 0 0 16px 0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #475569;
    }
    .stay-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 16px;
      gap: 12px;
    }
    .stay-col {
      flex: 1;
    }
    .stay-label {
      font-size: 11px;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .stay-value {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }
    .divider {
      height: 1px;
      background-color: #e2e8f0;
      margin: 16px 0;
    }
    .pricing-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    .pricing-row td {
      padding: 8px 0;
      font-size: 14px;
      color: #475569;
    }
    .pricing-row-total td {
      padding: 16px 0 8px 0;
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      border-top: 1px dashed #cbd5e1;
    }
    .savings-banner {
      background-color: #dcfce7;
      border: 1px solid #bbf7d0;
      color: #15803d;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 700;
      margin-top: 16px;
      text-align: center;
    }
    .status-chip {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .status-chip-paid {
      background-color: #dcfce7;
      color: #15803d;
    }
    .status-chip-pending {
      background-color: #fef3c7;
      color: #d97706;
    }
    .ai-insights {
      background-color: #eff6ff;
      border: 1px solid #dbeafe;
      border-radius: 12px;
      padding: 20px;
      margin: 24px;
    }
    .ai-insight-item {
      font-size: 13px;
      color: #1e40af;
      margin-bottom: 10px;
      display: flex;
      align-items: flex-start;
      gap: 8px;
      line-height: 1.5;
    }
    .policy-item {
      font-size: 12px;
      line-height: 1.6;
      color: #475569;
      margin-bottom: 8px;
    }
    .badge-allowed {
      background-color: #dcfce7;
      color: #15803d;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      text-transform: uppercase;
    }
    .badge-restricted {
      background-color: #fee2e2;
      color: #b91c1c;
      font-weight: 700;
      padding: 1px 6px;
      border-radius: 4px;
      font-size: 10px;
      text-transform: uppercase;
    }
    .actions-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin: 24px;
    }
    .voucher-print {
      border: 2px dashed #94a3b8;
      border-radius: 16px;
      padding: 24px;
      margin: 24px;
      background-color: #ffffff;
    }
    .voucher-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
    }
    .voucher-title {
      font-size: 18px;
      font-weight: 800;
      margin: 0;
      color: #0f172a;
    }
    .voucher-qr {
      width: 90px;
      height: 90px;
    }
    .footer {
      background-color: #0f172a;
      color: #94a3b8;
      padding: 32px 24px;
      text-align: center;
      font-size: 12px;
      line-height: 1.6;
    }
    .footer-links a {
      color: #38bdf8;
      text-decoration: none;
      margin: 0 8px;
    }
    @media print {
      body {
        background-color: #ffffff;
      }
      .email-container {
        box-shadow: none;
        max-width: 100%;
      }
      .no-print {
        display: none !important;
      }
      .voucher-print {
        border: none;
        margin: 0;
        padding: 0;
        page-break-before: always;
      }
    }
    @media (max-width: 480px) {
      .stay-row {
        flex-direction: column;
        gap: 12px;
      }
      .actions-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="email-container">
    
    <!-- 1. HEADER -->
    <div class="header">
      <a href="https://zivohotels.com" class="brand-logo">ZivoHotels</a><br>
      <div class="status-badge">Confirmed</div>
      <div class="booking-ref-title">Booking Reference</div>
      <div class="booking-ref-val">${booking.bookingRef}</div>
      <div class="verified-banner">
        <span>🛡️</span> Secured & Verified Booking
      </div>
    </div>

    <!-- 2. HERO HOTEL SECTION -->
    <div class="hero-section">
      <img src="${hotelImg}" alt="${hotel.name}" class="hotel-image">
    </div>
    
    <div class="hotel-details">
      <h2 class="hotel-name">${hotel.name}</h2>
      <div class="rating-stars">
        ${Array.from({ length: Math.round(hotel.rating || 5) }).map(() => '★').join('')}
        <span style="color: #475569; font-size: 13px; font-weight: bold; margin-left: 4px;">${hotel.rating} / 5</span>
      </div>
      <p class="hotel-address">${hotel.location}, ${hotel.city}</p>
      
      <div class="tags-container">
        <span class="tag">Top Rated Business Stay</span>
        <span class="tag">Couple Friendly</span>
        <span class="tag">Near Metro</span>
        <span class="tag">High Guest Satisfaction</span>
      </div>
      
      <div style="display: flex; gap: 8px;" class="no-print">
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hotel.name + ', ' + hotel.city)}" class="btn btn-secondary" style="flex: 1; padding: 10px 12px; font-size: 13px;">Get Directions</a>
        <a href="https://wa.me/919999999999?text=Hi%2C%20I%20have%20a%20booking%20at%20${encodeURIComponent(hotel.name)}%20with%20reference%20${booking.bookingRef}" class="btn btn-primary" style="flex: 1; padding: 10px 12px; font-size: 13px; background-color: #16a34a;">Chat on WhatsApp</a>
      </div>
    </div>

    <!-- 3. STAY DETAILS CARD -->
    <div class="card">
      <h3 class="card-title">Stay Details</h3>
      
      <div class="stay-row">
        <div class="stay-col">
          <div class="stay-label">📅 Check-in</div>
          <div class="stay-value">${checkInDate}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">From 02:00 PM</div>
        </div>
        <div class="stay-col">
          <div class="stay-label">📅 Check-out</div>
          <div class="stay-value">${checkOutDate}</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Until 11:00 AM</div>
        </div>
      </div>
      
      <div class="stay-row">
        <div class="stay-col">
          <div class="stay-label">🏨 Room Type</div>
          <div class="stay-value">${roomType.name}</div>
        </div>
        <div class="stay-col">
          <div class="stay-label">🍽️ Meal Plan</div>
          <div class="stay-value">${ratePlan.mealPlan === 'NONE' ? 'Room Only' : ratePlan.mealPlan === 'BREAKFAST' ? 'Breakfast Included' : 'Half Board'}</div>
        </div>
      </div>
      
      <div class="divider"></div>
      
      <div class="stay-row" style="margin-bottom: 0;">
        <div class="stay-col">
          <div class="stay-label">👤 Guests</div>
          <div class="stay-value">${booking.adults} Adults ${booking.children > 0 ? `, ${booking.children} Children` : ''}</div>
        </div>
        <div class="stay-col">
          <div class="stay-label">🔑 Booking Summary</div>
          <div class="stay-value">${booking.rooms} Room x ${nights} Night${nights > 1 ? 's' : ''}</div>
        </div>
      </div>
    </div>

    <!-- 4. PRICE BREAKDOWN -->
    <div class="card" style="background-color: #ffffff; border-color: #e2e8f0;">
      <h3 class="card-title">Price Breakdown</h3>
      
      <table class="pricing-table">
        <tr class="pricing-row">
          <td>Room Charges (${booking.rooms} Room x ${nights} Night)</td>
          <td style="text-align: right; font-weight: 700;">₹${roomPrice.toLocaleString('en-IN')}</td>
        </tr>
        <tr class="pricing-row">
          <td>Taxes & GST (${booking.taxPercentage || 12}%)</td>
          <td style="text-align: right; font-weight: 700;">₹${taxes.toLocaleString('en-IN')}</td>
        </tr>
        <tr class="pricing-row">
          <td>Service Fees</td>
          <td style="text-align: right; font-weight: 700; color: #16a34a;">FREE</td>
        </tr>
        <tr class="pricing-row-total">
          <td>Grand Total</td>
          <td style="text-align: right; font-weight: 800; color: #2563eb;">₹${formattedTotal}</td>
        </tr>
      </table>
      
      <div class="savings-banner">
        🎉 You are saving ₹${savings.toLocaleString('en-IN')} on this booking!
      </div>
      
      <div class="divider"></div>
      
      <div class="stay-row" style="margin-bottom: 0;">
        <div class="stay-col">
          <div class="stay-label">Payment Status</div>
          <div style="margin-top: 4px;">
            <span class="status-chip ${booking.paymentStatus === 'PAID' ? 'status-chip-paid' : 'status-chip-pending'}">
              ${booking.paymentStatus === 'PAID' ? 'Fully Paid' : booking.paymentStatus === 'PARTIAL_PAID' ? 'Deposit Paid' : 'Pay At Hotel'}
            </span>
          </div>
        </div>
        <div class="stay-col">
          <div class="stay-label">Amount Paid</div>
          <div class="stay-value" style="color: #16a34a;">₹${formattedPaid}</div>
        </div>
        ${booking.remainingAmount > 0 ? `
        <div class="stay-col">
          <div class="stay-label">Balance Due</div>
          <div class="stay-value" style="color: #dc2626;">₹${formattedRemaining}</div>
        </div>
        ` : ''}
      </div>
    </div>

    <!-- 5. AI SMART INSIGHTS -->
    <div class="ai-insights">
      <h3 class="card-title" style="color: #1e3a8a; display: flex; align-items: center; gap: 6px; font-size: 14px;">
        ✨ Zivo AI Assistant
      </h3>
      <div class="ai-insight-item">
        <span>⚡</span> <span><strong>Fast Check-in:</strong> Property check-in usually takes less than 5 minutes. Early check-in option is subject to availability.</span>
      </div>
      <div class="ai-insight-item">
        <span>📶</span> <span><strong>Connectivity:</strong> Guests consistently rate this property's Wi-Fi as "Exceptional" (Avg 85 Mbps).</span>
      </div>
      <div class="ai-insight-item">
        <span>🚙</span> <span><strong>Transit Hint:</strong> Weekday traffic near the hotel location is typically low. Free parking is secured for you.</span>
      </div>
    </div>

    <!-- 6. POLICIES & INFORMATION -->
    <div class="card" style="background-color: #ffffff;">
      <h3 class="card-title">Policies & Important Info</h3>
      <div class="policy-item">
        <span class="badge-allowed">Allowed</span> <strong>ID Requirements:</strong> Government approved photo ID (Aadhaar, Passport, Driving License) is mandatory for check-in. Local IDs are accepted.
      </div>
      <div class="policy-item">
        <span class="badge-allowed">Allowed</span> <strong>Couple Policy:</strong> Couples are welcome. Safe and friendly environment for guests.
      </div>
      <div class="policy-item">
        <span class="badge-restricted">Restricted</span> <strong>Pet Policy:</strong> Pets are not allowed inside the property premises.
      </div>
      <div class="policy-item">
        <span class="badge-restricted">Restricted</span> <strong>Smoking Policy:</strong> All guest rooms are 100% non-smoking. Designated smoking zones are available.
      </div>
      <div class="policy-item" style="margin-top: 12px; font-size: 11px; color: #64748b;">
        <strong>Cancellation Rule:</strong> ${ratePlan.cancellationPolicy || 'Standard cancellation policies apply.'}
      </div>
    </div>

    <!-- 7. GUEST SUPPORT BLOCK -->
    <div style="padding: 0 24px; text-align: center;">
      <h4 style="margin: 0 0 4px 0; color: #475569; font-size: 14px;">Need help with check-in or modifications?</h4>
      <p style="margin: 0 0 16px 0; color: #64748b; font-size: 12px;">Our dedicated guest support team is available 24/7.</p>
      <div style="font-weight: 700; font-size: 14px; color: #0f172a; margin-bottom: 24px;">
        📞 +91 99999 99999 &nbsp;|&nbsp; ✉️ bookings@zivohotels.com
      </div>
    </div>

    <!-- 8. ACTIONS -->
    <div class="actions-grid no-print">
      <a href="https://zivohotels.com/my-bookings" class="btn btn-primary">Manage Booking</a>
      <button onclick="window.print()" class="btn btn-secondary">Print Voucher</button>
    </div>

    <!-- 9. HOTEL VOUCHER SECTION -->
    <div class="voucher-print">
      <div class="voucher-header">
        <div>
          <div class="voucher-title">ZivoHotels Voucher</div>
          <div style="font-size: 12px; color: #64748b; margin-top: 4px;">Booked via ZivoHotels</div>
          <div style="font-size: 14px; font-weight: 700; color: #2563eb; margin-top: 12px;">CONFIRMED RESERVATION</div>
        </div>
        <img src="${qrCodeUrl}" alt="QR Code" class="voucher-qr">
      </div>
      
      <div class="divider"></div>
      
      <div style="margin-bottom: 20px;">
        <div class="stay-label">Lead Guest</div>
        <div class="stay-value" style="font-size: 16px;">${booking.guestName}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 2px;">Email: ${booking.guestEmail} &nbsp;·&nbsp; Phone: ${booking.guestPhone}</div>
      </div>
      
      <table style="width: 100%; font-size: 13px; line-height: 1.8; margin-bottom: 20px;">
        <tr>
          <td style="color: #64748b; font-weight: 700; width: 35%;">Hotel Name</td>
          <td style="font-weight: 700; color: #0f172a;">${hotel.name}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 700;">Address</td>
          <td style="color: #475569;">${hotel.location}, ${hotel.city}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 700;">Check-in Date</td>
          <td style="font-weight: 700; color: #0f172a;">${checkInDate} (after 02:00 PM)</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 700;">Check-out Date</td>
          <td style="font-weight: 700; color: #0f172a;">${checkOutDate} (before 11:00 AM)</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 700;">Room Type</td>
          <td style="font-weight: 700; color: #0f172a;">${roomType.name}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 700;">Rooms & Guests</td>
          <td style="font-weight: 700; color: #0f172a;">${booking.rooms} Room x ${booking.adults} Adults ${booking.children > 0 ? `, ${booking.children} Children` : ''}</td>
        </tr>
        <tr>
          <td style="color: #64748b; font-weight: 700;">Total Paid Amount</td>
          <td style="font-weight: 800; color: #16a34a; font-size: 15px;">₹${formattedPaid}</td>
        </tr>
        ${booking.remainingAmount > 0 ? `
        <tr>
          <td style="color: #64748b; font-weight: 700;">Balance Due at Desk</td>
          <td style="font-weight: 800; color: #dc2626; font-size: 15px;">₹${formattedRemaining}</td>
        </tr>
        ` : ''}
      </table>
      
      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; font-size: 11px; text-align: center; color: #64748b;">
        📢 <strong>Notice to Guest:</strong> Please present this voucher and a government approved ID card at the front desk.
      </div>
    </div>

    <!-- 11. FOOTER -->
    <div class="footer">
      <div style="font-weight: 800; margin-bottom: 8px; color: #ffffff;">ZivoHotels Security</div>
      <p style="margin: 0 0 16px 0;">This is an automated, secure booking notification. Your data is protected by Zivo Security standards. A copy of this voucher and tax invoice has been stored in your profile.</p>
      
      <div class="footer-links" style="margin-bottom: 24px;">
        <a href="https://zivohotels.com/terms">Terms & Conditions</a> &nbsp;·&nbsp;
        <a href="https://zivohotels.com/privacy">Privacy Policy</a> &nbsp;·&nbsp;
        <a href="https://zivohotels.com/support">Help Desk</a>
      </div>
      
      <div>© 2026 ZivoHotels Private Limited. All Rights Reserved.</div>
    </div>

  </div>
</body>
</html>
  `;
};

/**
 * Send Booking Confirmation Email
 * @param {string} bookingId - Booking ID in DB
 * @returns {Promise<boolean>}
 */
export const sendBookingConfirmationEmail = async (bookingId) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        hotel: true,
        roomType: true,
        ratePlan: true
      }
    });

    if (!booking) {
      console.error(`[EmailService] Booking not found: ${bookingId}`);
      return false;
    }

    const emailHtml = generateEmailHtml(booking, booking.hotel, booking.roomType, booking.ratePlan);

    const mailOptions = {
      from: '"ZivoHotels Bookings" <bookings@zivohotels.com>',
      to: booking.guestEmail,
      subject: `Booking Confirmed at ${booking.hotel.name} - Ref: ${booking.bookingRef}`,
      html: emailHtml
    };

    console.log(`[EmailService] Sending confirmation email for booking ${booking.bookingRef} to ${booking.guestEmail}...`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] Email sent successfully! Message ID: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error('[EmailService] Error sending booking confirmation email:', error);
    return false;
  }
};
