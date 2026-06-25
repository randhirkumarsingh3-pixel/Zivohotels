import { createOTP, verifyOTP } from '../otpService.js';
import eventBus from '../../events/eventBus.js';

class EmailOTPProvider {
  /**
   * Initiate OTP authentication
   * @param {Object} context - { email, ipAddress, userAgent }
   */
  async initiate(context) {
    const { email, ipAddress, userAgent } = context;
    
    // Core logic
    await createOTP(email, ipAddress, userAgent);

    // Emit event
    eventBus.emitEvent('AUTH_CHALLENGE_ISSUED', { 
      provider: 'EmailOTP',
      email, 
      ipAddress,
      timestamp: new Date()
    });

    return { success: true, message: 'OTP sent successfully' };
  }

  /**
   * Verify OTP authentication
   * @param {Object} context - { email, credential, ipAddress, userAgent }
   */
  async verify(context) {
    const { email, credential: otp, ipAddress, _userAgent } = context;
    
    // Core logic
    await verifyOTP(email, otp);

    // Emit event
    eventBus.emitEvent('AUTH_CHALLENGE_VERIFIED', { 
      provider: 'EmailOTP',
      email, 
      ipAddress,
      timestamp: new Date()
    });

    return { success: true, verifiedAt: new Date() };
  }
}

export default new EmailOTPProvider();
