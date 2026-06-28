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
      )}\n      {/* Commission & Fee Summary Card */}`
);

// Add disabled={isProtected} to inputs
file = file.replace(/<input/g, '<input disabled={isProtected}');
file = file.replace(/<select/g, '<select disabled={isProtected}');
file = file.replace(/<button([^>]*)onClick=\{handleVerify/g, '<button$1disabled={isProtected} onClick={handleVerify');

fs.writeFileSync('src/components/onboarding/steps/FinanceStep.jsx', file);

let basicFile = fs.readFileSync('src/components/onboarding/steps/BasicInfoStep.jsx', 'utf8');
basicFile = basicFile.replace(
  'const BasicInfoStep = ({ formData, updateForm }) => {',
  'const BasicInfoStep = ({ formData, updateForm, isAdmin = true }) => {\n  const isProtected = !isAdmin;'
);
basicFile = basicFile.replace(
  'value={formData.channelManagerName || \'\'}',
  'disabled={isProtected}\n              value={formData.channelManagerName || \'\'}'
);
basicFile = basicFile.replace(
  'value={formData.status || \'PENDING\'}',
  'disabled={isProtected}\n              value={formData.status || \'PENDING\'}'
);
basicFile = basicFile.replace(
  'onChange={e => updateForm(\'hasChannelManager\', e.target.checked)}',
  'onChange={e => updateForm(\'hasChannelManager\', e.target.checked)}\n                  disabled={isProtected}'
);
fs.writeFileSync('src/components/onboarding/steps/BasicInfoStep.jsx', basicFile);
console.log("Patched successfully");
