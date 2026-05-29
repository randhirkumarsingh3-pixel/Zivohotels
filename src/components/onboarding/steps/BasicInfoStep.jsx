import React, { useState, useEffect } from 'react';
import { CheckCircle2, Loader2, Info } from 'lucide-react';
import { sendVerificationOtp, verifyOtpApi } from '../../../services/api';

const BasicInfoStep = ({ formData, updateForm }) => {
  // Generate array of years from 1950 to current year + 2
  const currentYear = new Date().getFullYear();
  const years = Array.from(new Array(currentYear - 1950 + 3), (val, index) => currentYear + 2 - index);

  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [emailOtp, setEmailOtp] = useState('');
  const [otpValues, setOtpValues] = useState(['', '', '', '', '', '']);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [emailTimer, setEmailTimer] = useState(0);
  const [emailSuccessMsg, setEmailSuccessMsg] = useState('');
  
  const [verifyingMobile, setVerifyingMobile] = useState(false);
  const [mobileOtp, setMobileOtp] = useState('');
  const [sentMobileOtp, setSentMobileOtp] = useState('');

  const isEmailVerified = Boolean(formData.isEmailVerified);
    
  const isMobileVerified = Boolean(formData.isMobileVerified);

  const maskEmail = (email) => {
    if (!email) return '';
    const [name, domain] = email.split('@');
    if (!domain) return email;
    if (name.length <= 2) return `${name[0]}***@${domain}`;
    return `${name[0]}***${name[name.length-1]}@${domain}`;
  };

  const handleOtpChange = (index, value) => {
    if (/[^0-9]/.test(value)) return;
    const newOtp = [...otpValues];
    newOtp[index] = value;
    setOtpValues(newOtp);
    setEmailOtp(newOtp.join(''));
    
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpValues[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedData) {
      const newOtp = [...otpValues];
      for (let i = 0; i < pastedData.length; i++) {
        newOtp[i] = pastedData[i];
      }
      setOtpValues(newOtp);
      setEmailOtp(newOtp.join(''));
      const focusIndex = Math.min(pastedData.length, 5);
      document.getElementById(`otp-${focusIndex}`)?.focus();
    }
  };

  useEffect(() => {
    let interval;
    if (emailTimer > 0) {
      interval = setInterval(() => {
        setEmailTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [emailTimer]);

  const confirmEmailVerify = async () => {
    const email = formData.guestEmail || formData.receptionEmail;
    if (!emailOtp || emailOtp.length < 6) {
      alert("Please enter the 6-digit code.");
      return;
    }
    
    setIsVerifyingOtp(true);
    try {
      await verifyOtpApi(email, emailOtp);
      updateForm('isEmailVerified', true);
      setVerifyingEmail(false);
      setEmailOtp('');
      setOtpValues(['', '', '', '', '', '']);
      setEmailSuccessMsg("Email address verified successfully!");
      setTimeout(() => setEmailSuccessMsg(''), 3000);
    } catch (error) {
      let friendlyError = "Verification failed.";
      if (error.message.includes('expired')) friendlyError = "Code expired. Please request a new one.";
      else if (error.message.includes('Invalid')) friendlyError = "Invalid code. Please check and try again.";
      else if (error.message.includes('exceeded')) friendlyError = "Too many attempts. Please request a new code.";
      else friendlyError = `Verification failed: ${error.message}`;
      alert(friendlyError);
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const confirmMobileVerify = () => {
    if (mobileOtp === sentMobileOtp && sentMobileOtp !== '') {
      updateForm('isMobileVerified', true);
      setVerifyingMobile(false);
      setMobileOtp('');
      setSentMobileOtp('');
      alert("Mobile number verified successfully!");
    } else {
      alert("Please enter the correct 4-digit OTP shown in the alert.");
    }
  };

  return (
    <div className="p-4 sm:p-8 animate-fade-in bg-gray-50/50">
      <h1 className="text-2xl font-extrabold text-black mb-6">Basic Info</h1>
      
      {/* Property Details Card */}
      <div className="bg-white border border-gray-300 rounded-lg shadow-sm mb-8 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-300 bg-gray-50/30">
          <h2 className="text-xl font-bold text-gray-800">Property Details</h2>
          <p className="text-sm text-gray-500 mt-1">Update your property details here</p>
        </div>

        <div className="flex flex-col">
          {/* Name */}
          <div className="flex flex-col md:flex-row p-4 sm:p-6 border-b border-gray-200 gap-2 md:gap-6">
            <div className="w-full md:w-2/5 flex flex-col justify-center">
              <span className="font-bold text-gray-900 text-sm">Name of the Property <span className="text-red-500">*</span></span>
              <span className="text-xs text-gray-500 mt-1">Enter the name as on the property documents</span>
            </div>
            <div className="w-full md:w-3/5 flex items-center">
              <input 
                type="text" 
                value={formData.name || ''} 
                onChange={e => updateForm('name', e.target.value)} 
                className="w-full px-3 py-2 border border-gray-400 rounded-md focus:border-blue-500 outline-none text-gray-900 text-sm shadow-sm" 
              />
            </div>
          </div>

          {/* Property Type */}
          <div className="flex flex-col md:flex-row p-4 sm:p-6 border-b border-gray-200 gap-2 md:gap-6">
            <div className="w-full md:w-2/5 flex flex-col justify-center">
              <span className="font-bold text-gray-900 text-sm">Property Type <span className="text-red-500">*</span></span>
              <span className="text-xs text-gray-500 mt-1">Select the classification of your property</span>
            </div>
            <div className="w-full md:w-3/5 flex items-center">
              <select 
                value={formData.type || 'Hotel'} 
                onChange={e => updateForm('type', e.target.value)} 
                className="w-full px-3 py-2 border border-gray-400 rounded-md focus:border-blue-500 outline-none text-gray-900 text-sm shadow-sm bg-white"
              >
                <option>Hotel</option>
                <option>Resort</option>
                <option>Villa</option>
                <option>Apartment</option>
                <option>Hostel</option>
                <option>Homestay</option>
              </select>
            </div>
          </div>

          {/* Star Rating */}
          <div className="flex flex-col md:flex-row p-4 sm:p-6 border-b border-gray-200 gap-2 md:gap-6">
            <div className="w-full md:w-2/5 flex flex-col justify-center">
              <span className="font-bold text-gray-900 text-sm">Hotel Star Rating <span className="text-red-500">*</span></span>
            </div>
            <div className="w-full md:w-3/5 flex items-center">
              <select 
                value={formData.rating || '3'} 
                onChange={e => updateForm('rating', e.target.value)} 
                className="w-full px-3 py-2 border border-gray-400 rounded-md focus:border-blue-500 outline-none text-gray-900 text-sm shadow-sm bg-white"
              >
                <option value="5">5</option>
                <option value="4">4</option>
                <option value="3">3</option>
                <option value="2">2</option>
                <option value="1">1</option>
                <option value="0">Unrated</option>
              </select>
            </div>
          </div>

          {/* Built Year */}
          <div className="flex flex-col md:flex-row p-4 sm:p-6 border-b border-gray-200 gap-2 md:gap-6">
            <div className="w-full md:w-2/5 flex flex-col justify-center">
              <span className="font-bold text-gray-900 text-sm">When was the property built?</span>
            </div>
            <div className="w-full md:w-3/5 flex items-center">
              <select 
                value={formData.builtYear || currentYear} 
                onChange={e => updateForm('builtYear', e.target.value)} 
                className="w-full px-3 py-2 border border-gray-400 rounded-md focus:border-blue-500 outline-none text-gray-900 text-sm shadow-sm bg-white"
              >
                {years.map(year => (
                  <option key={`built-${year}`} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Accepting Booking Since */}
          <div className="flex flex-col md:flex-row p-4 sm:p-6 border-b border-gray-200 gap-2 md:gap-6">
            <div className="w-full md:w-2/5 flex flex-col justify-center">
              <span className="font-bold text-gray-900 text-sm">Accepting booking since?</span>
              <span className="text-xs text-gray-500 mt-1">Since when is this property available for guests to book</span>
            </div>
            <div className="w-full md:w-3/5 flex items-center">
              <select 
                value={formData.bookingSince || currentYear} 
                onChange={e => updateForm('bookingSince', e.target.value)} 
                className="w-full px-3 py-2 border border-gray-400 rounded-md focus:border-blue-500 outline-none text-gray-900 text-sm shadow-sm bg-white"
              >
                {years.map(year => (
                  <option key={`booking-${year}`} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Channel Manager */}
          <div className="flex flex-col md:flex-row p-4 sm:p-6 gap-2 md:gap-6">
            <div className="w-full md:w-2/5 flex flex-col justify-start pt-2">
              <span className="font-bold text-gray-900 text-sm">Do you work with channel manager?</span>
              <span className="text-xs text-gray-500 mt-1 pr-4">This allows to update inventory across different travel platforms</span>
            </div>
            <div className="w-full md:w-3/5 flex flex-col justify-start pt-2">
              <div className="flex items-center gap-6 mb-4">
                <label className="flex items-center cursor-pointer">
                  <input 
                    type="radio" 
                    name="channelManager" 
                    className="w-4 h-4 text-blue-600 border-gray-400 focus:ring-blue-500" 
                    checked={formData.hasChannelManager === false || formData.hasChannelManager === undefined}
                    onChange={() => updateForm('hasChannelManager', false)}
                  />
                  <span className="ml-2 text-sm font-semibold text-gray-700">No</span>
                </label>
                <label className="flex items-center cursor-pointer">
                  <input 
                    type="radio" 
                    name="channelManager" 
                    className="w-4 h-4 text-blue-600 border-gray-400 focus:ring-blue-500" 
                    checked={formData.hasChannelManager === true}
                    onChange={() => updateForm('hasChannelManager', true)}
                  />
                  <span className="ml-2 text-sm font-semibold text-gray-700">Yes</span>
                </label>
              </div>

              {formData.hasChannelManager && (
                <div className="animate-fade-in">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Select name of channel manager</label>
                  <select 
                    value={formData.channelManagerName || 'Axisrooms'} 
                    onChange={e => updateForm('channelManagerName', e.target.value)} 
                    className="w-full px-3 py-2 border border-gray-400 rounded-md focus:border-blue-500 outline-none text-gray-900 text-sm shadow-sm bg-white"
                  >
                    <option>Axisrooms</option>
                    <option>RateGain</option>
                    <option>SiteMinder</option>
                    <option>STAAH</option>
                    <option>eRevMax</option>
                    <option>Other</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contact Details Card */}
      <div className="bg-white border border-gray-300 rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-gray-300 bg-gray-50/30">
          <h2 className="text-xl font-bold text-gray-800">Contact details to be shared with guests</h2>
          <p className="text-sm text-gray-500 mt-1">These contact details will be shared with the guests when they make a booking</p>
        </div>

        <div className="flex flex-col">
          {/* Email ID */}
          <div className="flex flex-col md:flex-row p-4 sm:p-6 border-b border-gray-200 gap-2 md:gap-6">
            <div className="w-full md:w-2/5 flex flex-col justify-start pt-3">
              <span className="font-bold text-gray-900 text-sm">Email ID <span className="text-red-500">*</span></span>
            </div>
            <div className="w-full md:w-3/5 flex flex-col">
              <div className="relative">
                <input 
                  type="email" 
                  value={formData.guestEmail || formData.receptionEmail || ''} 
                  onChange={e => {
                    updateForm('guestEmail', e.target.value);
                    if (formData.isEmailVerified) updateForm('isEmailVerified', false);
                  }} 
                  disabled={isEmailVerified}
                  className={`w-full px-3 py-2.5 pr-24 border rounded-md outline-none text-sm shadow-sm transition-all ${
                    isEmailVerified 
                      ? 'border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed font-medium' 
                      : 'border-gray-400 bg-white text-gray-900 focus:border-blue-500'
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                  {isEmailVerified ? (
                    <span className="flex items-center text-teal-600 font-bold text-xs gap-1.5">
                      <CheckCircle2 size={14} className="fill-teal-600 text-white" />
                      Verified
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        const email = formData.guestEmail || formData.receptionEmail;
                        if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                          setIsSendingOtp(true);
                          try {
                            await sendVerificationOtp(email);
                            setVerifyingEmail(true);
                            setEmailTimer(30);
                            setEmailSuccessMsg(`✓ Verification code sent to ${maskEmail(email)}`);
                            setTimeout(() => setEmailSuccessMsg(''), 5000);
                          } catch (error) {
                            let friendlyError = error.message;
                            if (error.message.includes('Too many OTP')) friendlyError = "Too many requests. Please wait before trying again.";
                            alert(`Failed to send OTP: ${friendlyError}`);
                          } finally {
                            setIsSendingOtp(false);
                          }
                        } else {
                          alert("Please enter a valid email address first.");
                        }
                      }}
                      disabled={isSendingOtp}
                      className="text-blue-600 hover:text-blue-800 font-bold text-xs cursor-pointer hover:underline disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      {isSendingOtp ? <><Loader2 size={12} className="animate-spin" /> Sending...</> : 'Verify'}
                    </button>
                  )}
                </div>
              </div>
              
              {emailSuccessMsg && (
                <div className="mt-2 text-sm text-green-600 font-medium flex items-center gap-1.5 animate-fade-in">
                  <CheckCircle2 size={16} className="text-green-600" />
                  {emailSuccessMsg}
                </div>
              )}

              {verifyingEmail && (
                <div className="mt-3 p-4 bg-blue-50/50 rounded-lg border border-blue-100 flex flex-col gap-4 animate-fade-in">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <span className="text-[10px] text-blue-600 font-bold block mb-2">ENTER 6-DIGIT VERIFICATION CODE</span>
                      <div className="flex gap-2" onPaste={handleOtpPaste}>
                        {otpValues.map((digit, idx) => (
                          <input
                            key={`otp-${idx}`}
                            id={`otp-${idx}`}
                            type="text"
                            maxLength={1}
                            value={digit}
                            autoComplete={idx === 0 ? "one-time-code" : "off"}
                            onChange={(e) => handleOtpChange(idx, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                            className="w-10 h-12 border border-gray-300 rounded-md text-lg font-bold text-center focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 shadow-sm transition-all bg-white"
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0 self-end mt-2 sm:mt-0">
                      <button 
                        type="button"
                        onClick={() => { setVerifyingEmail(false); setEmailTimer(0); setOtpValues(['','','','','','']); setEmailOtp(''); }}
                        className="px-4 py-2 bg-white text-gray-700 rounded-md border border-gray-300 text-xs font-bold hover:bg-gray-50 shadow-sm transition-colors"
                      >
                        Cancel
                      </button>
                      <button 
                        type="button"
                        onClick={confirmEmailVerify}
                        disabled={isVerifyingOtp}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-colors"
                      >
                        {isVerifyingOtp ? <Loader2 size={14} className="animate-spin" /> : null}
                        Verify
                      </button>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-500 border-t border-blue-100 pt-3">
                    <div className="flex items-start gap-1.5 mb-1.5">
                      <Info size={14} className="text-gray-400 mt-0.5" />
                      <div>
                        <strong>Didn't receive the code?</strong>
                        <ul className="list-disc pl-4 mt-1 space-y-0.5 text-gray-500">
                          <li>Check your Spam/Junk folder</li>
                          <li>Verify email spelling</li>
                          <li>
                            {emailTimer > 0 ? (
                              <span className="text-gray-400">Request a new OTP in {emailTimer} seconds</span>
                            ) : (
                              <button 
                                type="button"
                                onClick={async () => {
                                  const email = formData.guestEmail || formData.receptionEmail;
                                  setIsSendingOtp(true);
                                  try {
                                    await sendVerificationOtp(email);
                                    setEmailTimer(30);
                                    setEmailSuccessMsg(`✓ Verification code resent to ${maskEmail(email)}`);
                                    setTimeout(() => setEmailSuccessMsg(''), 5000);
                                  } catch (error) {
                                    alert(`Failed to resend code. Please try again.`);
                                  } finally {
                                    setIsSendingOtp(false);
                                  }
                                }}
                                className="text-blue-600 hover:underline font-semibold"
                              >
                                Request a new OTP
                              </button>
                            )}
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {isEmailVerified && (
                <div className="text-right mt-1">
                  <button 
                    type="button"
                    onClick={() => {
                      updateForm('isEmailVerified', false);
                    }}
                    className="text-blue-500 hover:text-blue-700 text-xs font-semibold cursor-pointer"
                  >
                    Change
                  </button>
                </div>
              )}            </div>
          </div>

          {/* Mobile Number */}
          <div className="flex flex-col md:flex-row p-4 sm:p-6 border-b border-gray-200 gap-2 md:gap-6">
            <div className="w-full md:w-2/5 flex flex-col justify-start pt-3">
              <span className="font-bold text-gray-900 text-sm">Mobile number <span className="text-red-500">*</span></span>
            </div>
            <div className="w-full md:w-3/5 flex flex-col">
              <div className="flex shadow-sm rounded-md relative">
                <div className="flex items-center px-3 border border-r-0 border-gray-300 bg-gray-100 rounded-l-md text-sm text-gray-500 cursor-not-allowed">
                  +91 <span className="ml-2 opacity-50">v</span>
                </div>
                <input 
                  type="tel" 
                  value={formData.guestMobile || formData.receptionPhone || ''} 
                  onChange={e => {
                    updateForm('guestMobile', e.target.value.replace(/\D/g, ''));
                    if (formData.isMobileVerified) updateForm('isMobileVerified', false);
                  }} 
                  disabled={isMobileVerified}
                  className={`flex-1 w-full px-3 py-2.5 pr-24 border border-l-0 rounded-r-md outline-none text-sm transition-all ${
                    isMobileVerified 
                      ? 'border-gray-300 bg-gray-100 text-gray-500 cursor-not-allowed font-medium' 
                      : 'border-gray-400 bg-white text-gray-900 focus:border-blue-500'
                  }`}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
                  {isMobileVerified ? (
                    <span className="flex items-center text-teal-600 font-bold text-xs gap-1.5">
                      <CheckCircle2 size={14} className="fill-teal-600 text-white" />
                      Verified
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        const phone = formData.guestMobile || formData.receptionPhone;
                        if (phone && phone.length >= 10) {
                          const code = Math.floor(1000 + Math.random() * 9000).toString();
                          setSentMobileOtp(code);
                          alert(`[Mock OTP Service] An OTP code has been sent to +91 ${phone}.\nYour 4-digit OTP is: ${code}`);
                          setVerifyingMobile(true);
                        } else {
                          alert("Please enter a valid 10-digit mobile number first.");
                        }
                      }}
                      className="text-blue-600 hover:text-blue-800 font-bold text-xs cursor-pointer hover:underline"
                    >
                      Verify
                    </button>
                  )}
                </div>
              </div>
              
              {verifyingMobile && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between gap-3 animate-fade-in">
                  <div className="flex-1">
                    <span className="text-[10px] text-blue-600 font-bold block mb-1">ENTER 4-DIGIT OTP</span>
                    <input 
                      type="text" 
                      placeholder="e.g. 1234" 
                      maxLength={4}
                      value={mobileOtp} 
                      onChange={e => setMobileOtp(e.target.value.replace(/\D/g, ''))}
                      className="px-2.5 py-1.5 border border-gray-300 rounded text-xs font-mono w-24 text-center focus:outline-none focus:border-blue-500" 
                    />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button 
                      type="button"
                      onClick={() => setVerifyingMobile(false)}
                      className="px-3 py-1.5 bg-white text-gray-600 rounded border border-gray-300 text-xs font-bold hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button 
                      type="button"
                      onClick={confirmMobileVerify}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              )}

              {isMobileVerified && (
                <div className="text-right mt-1 mb-3">
                  <button 
                    type="button"
                    onClick={() => {
                      updateForm('isMobileVerified', false);
                    }}
                    className="text-blue-500 hover:text-blue-700 text-xs font-semibold cursor-pointer"
                  >
                    Change
                  </button>
                </div>
              )}

              <label className="flex items-center cursor-pointer mt-1">
                <input 
                  type="checkbox" 
                  checked={formData.whatsappSameAsMobile === true}
                  onChange={e => updateForm('whatsappSameAsMobile', e.target.checked)}
                  className="w-4 h-4 text-gray-800 border-gray-400 rounded focus:ring-gray-800 rounded-sm"
                />
                <span className="ml-2 text-sm text-gray-700 font-medium">Use the same mobile number for WhatsApp.</span>
              </label>
            </div>
          </div>

          {/* Landline Number */}
          <div className="flex flex-col md:flex-row p-4 sm:p-6 gap-2 md:gap-6">
            <div className="w-full md:w-2/5 flex flex-col justify-center">
              <span className="font-bold text-gray-900 text-sm">Landline number <span className="font-normal text-gray-500">(Optional)</span></span>
            </div>
            <div className="w-full md:w-3/5 flex items-center">
              <input 
                type="tel" 
                value={formData.guestLandline || ''} 
                onChange={e => updateForm('guestLandline', e.target.value)} 
                className="w-full px-3 py-2 border border-gray-400 rounded-md focus:border-blue-500 outline-none text-gray-900 text-sm shadow-sm" 
                placeholder="Eg: 0124 46373533"
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default BasicInfoStep;
