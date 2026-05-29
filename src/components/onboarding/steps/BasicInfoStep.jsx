import React, { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { sendVerificationOtp, verifyOtpApi } from '../../../services/api';

const BasicInfoStep = ({ formData, updateForm }) => {
  // Generate array of years from 1950 to current year + 2
  const currentYear = new Date().getFullYear();
  const years = Array.from(new Array(currentYear - 1950 + 3), (val, index) => currentYear + 2 - index);

  const [verifyingEmail, setVerifyingEmail] = useState(false);
  const [emailOtp, setEmailOtp] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  
  const [verifyingMobile, setVerifyingMobile] = useState(false);
  const [mobileOtp, setMobileOtp] = useState('');
  const [sentMobileOtp, setSentMobileOtp] = useState('');

  const isEmailVerified = Boolean(formData.isEmailVerified);
    
  const isMobileVerified = Boolean(formData.isMobileVerified);

  const confirmEmailVerify = async () => {
    const email = formData.guestEmail || formData.receptionEmail;
    if (!emailOtp || emailOtp.length < 4) {
      alert("Please enter the 4-digit code.");
      return;
    }
    
    setIsVerifyingOtp(true);
    try {
      await verifyOtpApi(email, emailOtp);
      updateForm('isEmailVerified', true);
      setVerifyingEmail(false);
      setEmailOtp('');
      alert("Email address verified successfully!");
    } catch (error) {
      alert(`Verification failed: ${error.message}`);
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
                            alert(`An OTP has been sent to ${email}`);
                          } catch (error) {
                            alert(`Failed to send OTP: ${error.message}`);
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
              
              {verifyingEmail && (
                <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between gap-3 animate-fade-in">
                  <div className="flex-1">
                    <span className="text-[10px] text-blue-600 font-bold block mb-1">ENTER 4-DIGIT VERIFICATION CODE</span>
                    <input 
                      type="text" 
                      placeholder="e.g. 1234" 
                      maxLength={4}
                      value={emailOtp} 
                      onChange={e => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                      className="px-2.5 py-1.5 border border-gray-300 rounded text-xs font-mono w-24 text-center focus:outline-none focus:border-blue-500" 
                    />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button 
                      type="button"
                      onClick={() => setVerifyingEmail(false)}
                      className="px-3 py-1.5 bg-white text-gray-600 rounded border border-gray-300 text-xs font-bold hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button 
                      type="button"
                      onClick={confirmEmailVerify}
                      disabled={isVerifyingOtp}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isVerifyingOtp ? <Loader2 size={12} className="animate-spin" /> : null}
                      Confirm
                    </button>
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
