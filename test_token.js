const email = "test_token_" + Date.now() + "@example.com";
const password = "Password123!";

async function test() {
  const signup = await fetch("https://zivohotels-api.onrender.com/api/v1/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test User", email, password, phone: "1234567890" })
  });
  const signupData = await signup.json();
  console.log("Signup Data:", signupData);
}
test();
