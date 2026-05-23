/**
 * Fraud Scoring Model (Logistic-style weighted scoring)
 */
export const fraudModel = {
  /**
   * Calculates a risk score (0-100) based on weighted features
   */
  score: (features) => {
    const weights = {
      failedPayments: 0.35,
      refundRate: 0.40,
      bookingVelocity: 0.15,
      deviceRisk: 0.10
    };

    let risk = 0;
    
    // Normalize features to 0-1 scale before weighting
    // e.g., failedPayments capped at 10
    const normalized = {
      failedPayments: Math.min(features.failedPayments / 10, 1),
      refundRate: Math.min(features.refundRate, 1),
      bookingVelocity: Math.min(features.bookingVelocity / 5, 1),
      deviceRisk: features.deviceRisk || 0
    };

    for (const key in weights) {
      risk += normalized[key] * weights[key];
    }

    return Math.min(Math.round(risk * 100), 100);
  },

  /**
   * Decides status based on score
   */
  evaluate: (riskScore) => {
    if (riskScore >= 85) return 'BLOCKED';
    if (riskScore >= 50) return 'VERIFICATION_REQUIRED';
    if (riskScore >= 30) return 'FLAGGED';
    return 'ALLOW';
  }
};

export default fraudModel;
