// Utility function to get dates between start and end (inclusive of start, exclusive of end)
export const getDatesInRange = (startDate, endDate) => {
  const dates = [];
  let current = new Date(startDate);
  const end = new Date(endDate);
  
  // Ensure we set to midnight to avoid timezone slippage during calculation
  current.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  while (current < end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

export const formatDate = (date) => {
  return new Date(date).toISOString().split('T')[0];
};
