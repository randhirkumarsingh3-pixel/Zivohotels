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
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Let's start with the basics.</h1>
        <p className="text-slate-500 mt-2 text-lg">Tell us a bit about your property so we can set up your profile.</p>
      </div>
      
      <div className="flex flex-col gap-8">
        {/* Name */}
        <div className="flex flex-col gap-2">
          <label className="font-bold text-slate-800 text-base">What is the name of your property? <span className="text-red-500">*</span></label>
          <span className="text-sm text-slate-500">Guests will see this name when they search for a place to stay.</span>
          <input 
            type="text" 
            value={formData.name || ''} 
            onChange={e => updateForm('name', e.target.value)} 
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-slate-900 text-base transition-all bg-white" 
            placeholder="e.g. The Grand Zivo Resort"
          />
        </div>

        {/* Property Type */}
        <div className="flex flex-col gap-2">
          <label className="font-bold text-slate-800 text-base">What type of property is this? <span className="text-red-500">*</span></label>
          <select 
            value={formData.type || 'Hotel'} 
            onChange={e => updateForm('type', e.target.value)} 
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-slate-900 text-base transition-all bg-white"
          >
            <option>Hotel</option>
            <option>Resort</option>
            <option>Villa</option>
            <option>Apartment</option>
            <option>Hostel</option>
            <option>Homestay</option>
          </select>
        </div>

        {/* Star Rating */}
        <div className="flex flex-col gap-2">
          <label className="font-bold text-slate-800 text-base">What is your property's star rating? <span className="text-red-500">*</span></label>
          <select 
            value={formData.rating || '3'} 
            onChange={e => updateForm('rating', e.target.value)} 
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-slate-900 text-base transition-all bg-white"
          >
            <option value="5">5 Stars</option>
            <option value="4">4 Stars</option>
            <option value="3">3 Stars</option>
            <option value="2">2 Stars</option>
            <option value="1">1 Star</option>
            <option value="0">Unrated</option>
          </select>
        </div>

        {/* Built Year */}
        <div className="flex flex-col gap-2">
          <label className="font-bold text-slate-800 text-base">What year was the property built?</label>
          <select 
            value={formData.builtYear || currentYear} 
            onChange={e => updateForm('builtYear', e.target.value)} 
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-slate-900 text-base transition-all bg-white"
          >
            {years.map(year => (
              <option key={`built-${year}`} value={year}>{year}</option>
            ))}
          </select>
        </div>

        {/* Accepting Booking Since */}
        <div className="flex flex-col gap-2">
          <label className="font-bold text-slate-800 text-base">Since when have you been accepting bookings?</label>
          <span className="text-sm text-slate-500">Helps us build your property's history and credibility.</span>
          <select 
            value={formData.bookingSince || currentYear} 
            onChange={e => updateForm('bookingSince', e.target.value)} 
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-slate-900 text-base transition-all bg-white"
          >
            {years.map(year => (
              <option key={`booking-${year}`} value={year}>{year}</option>
            ))}
          </select>
        </div>

        {/* Channel Manager */}
        <div className="flex flex-col gap-2">
          <label className="font-bold text-slate-800 text-base">Do you use a Channel Manager?</label>
          <span className="text-sm text-slate-500 mb-2">Connect your channel manager to automatically sync inventory and rates.</span>
          
          <div className="flex flex-col sm:flex-row gap-4 mb-2">
            <label className={`flex items-center justify-center py-3 px-6 border rounded-xl cursor-pointer transition-all flex-1 ${formData.hasChannelManager === false || formData.hasChannelManager === undefined ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold' : 'border-slate-300 hover:border-slate-400 text-slate-700'}`}>
              <input 
                type="radio" 
                name="channelManager" 
                className="hidden" 
                checked={formData.hasChannelManager === false || formData.hasChannelManager === undefined}
                onChange={() => updateForm('hasChannelManager', false)}
              />
              No, I'll manage it here
            </label>
            <label className={`flex items-center justify-center py-3 px-6 border rounded-xl cursor-pointer transition-all flex-1 ${formData.hasChannelManager === true ? 'border-blue-600 bg-blue-50 text-blue-700 font-bold' : 'border-slate-300 hover:border-slate-400 text-slate-700'}`}>
              <input 
                type="radio" 
                name="channelManager" 
                className="hidden" 
                checked={formData.hasChannelManager === true}
                onChange={() => updateForm('hasChannelManager', true)}
              />
              Yes, I use one
            </label>
          </div>

          {formData.hasChannelManager && (
            <div className="animate-fade-in mt-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Which channel manager do you use?</label>
              <select 
                value={formData.channelManagerName || 'Axisrooms'} 
                onChange={e => updateForm('channelManagerName', e.target.value)} 
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-slate-900 text-base transition-all bg-white"
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

        <div className="h-px w-full bg-slate-200 my-4"></div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-6">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Guest Facing Contacts</h2>
            <p className="text-slate-500 mt-1 text-sm">How should guests contact your front desk?</p>
          </div>

        {/* Email ID */}
        <div className="flex flex-col gap-2">
          <label className="font-bold text-slate-800 text-base">Property Email Address <span className="text-red-500">*</span></label>
          <div className="relative">
            <input 
              type="email" 
              value={formData.guestEmail || formData.receptionEmail || ''} 
              onChange={e => {
                updateForm('guestEmail', e.target.value);
                if (formData.isEmailVerified) updateForm('isEmailVerified', false);
              }} 
              disabled={isEmailVerified}
              className={`w-full px-4 py-3 pr-28 border rounded-xl outline-none text-base shadow-sm transition-all ${
                isEmailVerified 
                  ? 'border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed font-medium' 
                  : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
              }`}
              placeholder="e.g. hello@property.com"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
              {isEmailVerified ? (
                <span className="flex items-center text-teal-600 font-bold text-xs gap-1.5 px-3 py-1 bg-teal-50 rounded-lg">
                  <CheckCircle2 size={14} className="text-teal-600" />
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
                  className="text-blue-600 hover:text-blue-800 font-bold text-sm cursor-pointer hover:bg-blue-50 px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 transition-colors"
                >
                  {isSendingOtp ? <><Loader2 size={14} className="animate-spin" /> Sending</> : 'Verify'}
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
            <div className="mt-3 p-5 bg-blue-50/50 rounded-xl border border-blue-100 flex flex-col gap-4 animate-fade-in">
              <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4">
                <div className="flex-1 w-full md:w-auto overflow-hidden">
                  <span className="text-[10px] text-blue-600 font-bold block mb-2 uppercase tracking-widest">Enter 6-Digit Code</span>
                  <div className="flex gap-2 w-full justify-start overflow-x-auto pb-1" onPaste={handleOtpPaste}>
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
                        className="w-10 sm:w-12 h-12 border border-blue-200 rounded-lg text-lg font-bold text-center focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 shadow-sm transition-all bg-white"
                      />
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 w-full sm:w-auto justify-end shrink-0 mt-2 sm:mt-0">
                  <button 
                    type="button"
                    onClick={() => { setVerifyingEmail(false); setEmailTimer(0); setOtpValues(['','','','','','']); setEmailOtp(''); }}
                    className="px-4 py-2.5 bg-white text-slate-700 rounded-lg border border-slate-300 text-sm font-bold hover:bg-slate-50 shadow-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button"
                    onClick={confirmEmailVerify}
                    disabled={isVerifyingOtp}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold disabled:opacity-50 flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                  >
                    {isVerifyingOtp ? <Loader2 size={16} className="animate-spin" /> : null}
                    Verify
                  </button>
                </div>
              </div>
              
              <div className="text-xs text-slate-500 border-t border-blue-100/50 pt-3">
                <div className="flex items-start gap-1.5 mb-1.5">
                  <Info size={14} className="text-slate-400 mt-0.5" />
                  <div>
                    <strong className="text-slate-700">Didn't receive the code?</strong>
                    <ul className="list-disc pl-4 mt-1 text-slate-500">
                      <li>Check your Spam/Junk folder</li>
                      <li>Verify email spelling</li>
                      <li className="mt-1">
                        {emailTimer > 0 ? (
                          <span className="text-slate-400">Request a new OTP in {emailTimer}s</span>
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
                onClick={() => updateForm('isEmailVerified', false)}
                className="text-blue-600 hover:text-blue-800 text-sm font-semibold cursor-pointer underline"
              >
                Change Email Address
              </button>
            </div>
          )}
        </div>

        {/* Mobile Number */}
        <div className="flex flex-col gap-2 mt-4">
          <label className="font-bold text-slate-800 text-base">Front Desk Mobile Number <span className="text-red-500">*</span></label>
          <div className="flex shadow-sm rounded-xl relative group">
            <div className="flex items-center px-4 border border-r-0 border-slate-300 bg-slate-50 rounded-l-xl text-base text-slate-500 cursor-not-allowed">
              +91
            </div>
            <input 
              type="tel" 
              value={formData.guestMobile || formData.receptionPhone || ''} 
              onChange={e => {
                updateForm('guestMobile', e.target.value.replace(/\D/g, ''));
                if (formData.isMobileVerified) updateForm('isMobileVerified', false);
              }} 
              disabled={isMobileVerified}
              className={`flex-1 w-full px-4 py-3 pr-28 border border-l-0 rounded-r-xl outline-none text-base transition-all ${
                isMobileVerified 
                  ? 'border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed font-medium' 
                  : 'border-slate-300 bg-white text-slate-900 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10'
              }`}
              placeholder="e.g. 9876543210"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
              {isMobileVerified ? (
                <span className="flex items-center text-teal-600 font-bold text-xs gap-1.5 px-3 py-1 bg-teal-50 rounded-lg">
                  <CheckCircle2 size={14} className="text-teal-600" />
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
                  className="text-blue-600 hover:text-blue-800 font-bold text-sm cursor-pointer hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Verify
                </button>
              )}
            </div>
          </div>
          
          {verifyingMobile && (
            <div className="mt-2 p-4 bg-blue-50/50 rounded-xl border border-blue-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-fade-in">
              <div className="flex-1 w-full sm:w-auto">
                <span className="text-[10px] text-blue-600 font-bold block mb-2 uppercase tracking-widest">Enter 4-Digit OTP</span>
                <input 
                  type="text" 
                  placeholder="e.g. 1234" 
                  maxLength={4}
                  value={mobileOtp} 
                  onChange={e => setMobileOtp(e.target.value.replace(/\D/g, ''))}
                  className="px-4 py-2 border border-blue-200 rounded-lg text-lg font-mono w-32 text-center focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 shadow-sm bg-white" 
                />
              </div>
              <div className="flex gap-2 w-full sm:w-auto justify-end shrink-0 mt-2 sm:mt-0">
                <button 
                  type="button"
                  onClick={() => setVerifyingMobile(false)}
                  className="px-4 py-2.5 bg-white text-slate-700 rounded-lg border border-slate-300 text-sm font-bold hover:bg-slate-50 shadow-sm transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={confirmMobileVerify}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95"
                >
                  Confirm
                </button>
              </div>
            </div>
          )}

          {isMobileVerified && (
            <div className="text-right mt-1 mb-2">
              <button 
                type="button"
                onClick={() => updateForm('isMobileVerified', false)}
                className="text-blue-600 hover:text-blue-800 text-sm font-semibold cursor-pointer underline"
              >
                Change Mobile Number
              </button>
            </div>
          )}

          <label className="flex items-center cursor-pointer mt-2 group w-fit">
            <input 
              type="checkbox" 
              checked={formData.whatsappSameAsMobile === true}
              onChange={e => updateForm('whatsappSameAsMobile', e.target.checked)}
              className="w-5 h-5 text-blue-600 border-slate-300 rounded cursor-pointer focus:ring-blue-500 focus:ring-2"
            />
            <span className="ml-3 text-sm text-slate-700 font-medium group-hover:text-slate-900 transition-colors">Use this number for WhatsApp communications</span>
          </label>
        </div>

        {/* Landline Number */}
        <div className="flex flex-col gap-2">
          <label className="font-bold text-slate-800 text-base">Landline Number <span className="font-normal text-slate-500 ml-1">(Optional)</span></label>
          <input 
            type="tel" 
            value={formData.guestLandline || ''} 
            onChange={e => updateForm('guestLandline', e.target.value)} 
            className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none text-slate-900 text-base shadow-sm transition-all bg-white" 
            placeholder="e.g. 0124 46373533"
          />
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-6 mt-8">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Management Contacts</h2>
          <p className="text-slate-500 mt-1 text-sm">Internal contact details for platform notifications (not shown to guests).</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <label className="font-bold text-slate-800 text-base">Manager Name</label>
            <input 
              type="text" 
              value={formData.managerName || ''} 
              onChange={e => updateForm('managerName', e.target.value)} 
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
              placeholder="e.g. Rahul Sharma"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-bold text-slate-800 text-base">Manager Phone</label>
            <input 
              type="tel" 
              value={formData.managerPhone || ''} 
              onChange={e => updateForm('managerPhone', e.target.value)} 
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
              placeholder="e.g. 9876543210"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-2">
            <label className="font-bold text-slate-800 text-base">Owner Name</label>
            <input 
              type="text" 
              value={formData.ownerName || ''} 
              onChange={e => updateForm('ownerName', e.target.value)} 
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
              placeholder="e.g. Priya Patel"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-bold text-slate-800 text-base">Owner Email</label>
            <input 
              type="email" 
              value={formData.ownerEmail || ''} 
              onChange={e => updateForm('ownerEmail', e.target.value)} 
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all" 
              placeholder="e.g. owner@property.com"
            />
          </div>
        </div>
      </div>
    </div>
    </div>
  );
};

export default BasicInfoStep;
