/* User profile and goal hierarchy — read/write helpers used across modules */

window.getProfile = function() {
  try {
    const s = JSON.parse(localStorage.getItem('po_water_v1'));
    return (s && s.profile) || {};
  } catch(e) { return {}; }
};

window.getGoals = function() {
  try {
    return JSON.parse(localStorage.getItem('user_goals_v1')) || {};
  } catch(e) { return {}; }
};

window.saveGoals = function(goals) {
  localStorage.setItem('user_goals_v1', JSON.stringify(goals));
};
