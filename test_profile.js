const email = "test_profile_" + Date.now() + "@example.com";
const password = "Password123!";

async function test() {
  const signup = await fetch("https://zivohotels-api.onrender.com/api/v1/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test User", email, password, phone: "1234567890" })
  });
  const signupData = await signup.json();
  const token = signupData.token;

  console.log("Fetching invoices (protected route)...");
  const invoices = await fetch("https://zivohotels-api.onrender.com/api/v1/invoices/my-invoices", {
    headers: { "Authorization": "Bearer " + token }
  });
  
  console.log("Status:", invoices.status);
  console.log("Response:", await invoices.text());
}
test();
