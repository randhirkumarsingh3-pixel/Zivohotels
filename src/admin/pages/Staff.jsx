import TeamManager from '../../components/team/TeamManager';
import { adminTeamApi } from '../../services/api';
import usePageTitle from '../../hooks/usePageTitle';

/** ZivoHotels staff: invite people to the admin console with a role; custom roles. */
const Staff = () => {
  usePageTitle('Staff & Roles');
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <TeamManager api={adminTeamApi} title="Staff & Roles"
        intro="ZivoHotels team members who can use the admin console, and what each role may do. Each person only sees the parts of the console their role allows." />
    </div>
  );
};

export default Staff;
