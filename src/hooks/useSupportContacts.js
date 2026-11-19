import { useEffect, useState } from 'react';
import { getPublicConfig } from '../services/api';

/**
 * ZivoHotels guest support contacts from Admin → Platform Settings → Support:
 * { phone, email, whatsapp, whatsappLink, hours }. Empty values until loaded or when not set.
 */
const EMPTY = { phone: '', email: '', whatsapp: '', whatsappLink: '', hours: '' };

const useSupportContacts = () => {
  const [support, setSupport] = useState(EMPTY);
  useEffect(() => {
    let live = true;
    getPublicConfig().then((r) => { if (live && r?.data?.support) setSupport({ ...EMPTY, ...r.data.support }); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return support;
};

export default useSupportContacts;
