export const mapMealPlanToBackend = (mp) => {
  switch (mp) {
    case 'FREE Breakfast': return 'CP';
    case 'Room Only': return 'EP';
    case 'Breakfast & Dinner': return 'MAP';
    case 'All Meals': return 'AP';
    default: return 'NONE';
  }
};

export const mapMealPlanToFrontend = (mp) => {
  switch (mp) {
    case 'CP': return 'FREE Breakfast';
    case 'EP': return 'Room Only';
    case 'MAP': return 'Breakfast & Dinner';
    case 'AP': return 'All Meals';
    default: return 'Room Only';
  }
};

export const normalizeMealPlan = (mp) => {
  const backendVal = mapMealPlanToBackend(mp);
  return backendVal !== 'NONE' ? backendVal : 'EP'; // Default to EP if missing
};
