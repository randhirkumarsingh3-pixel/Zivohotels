import { Resend } from 'resend';
const resend = new Resend('re_5aMVgoS9_Hzpv1ykUA3unMjYPEvn3F18R');

async function test() {
  try {
    const data = await resend.emails.get('ce0538f2-7d5d-441f-ba99-74a27dda7b03');
    console.log("Status:", data);
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
