import { Resend } from 'resend';
const resend = new Resend('re_5aMVgoS9_Hzpv1ykUA3unMjYPEvn3F18R');

async function test() {
  try {
    const data = await resend.emails.list();
    console.log("Emails:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
