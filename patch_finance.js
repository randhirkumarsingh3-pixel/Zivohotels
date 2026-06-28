const fs = require('fs');
let file = fs.readFileSync('src/components/onboarding/steps/FinanceStep.jsx', 'utf8');

// Add isAdmin to props
file = file.replace(
  'const FinanceStep = ({ formData, updateForm }) => {',
  'const FinanceStep = ({ formData, updateForm, isAdmin = true }) => {\n  const isProtected = !isAdmin;'
);

// Add warning banner
file = file.replace(
  '{/* Commission & Fee Summary Card */}',
  `{isProtected && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl mb-6 flex items-center gap-3">
          <AlertCircle size={20} className="text-red-500" />
          <p className="text-sm font-medium">Certain financial and compliance fields are locked. Please contact support to modify them.</p>
        </div>
      )}
      {/* Commission & Fee Summary Card */}`
);

// Add disabled={isProtected} to inputs
file = file.replace(/className="([^"]+)"/g, (match) => {
  return match + ' disabled={isProtected}';
});

// Since the global replace adds disabled to everything including divs, we should be more specific.
// Let's reload and just target inputs, selects, and buttons.
