import TeamManager from '../../components/team/TeamManager';
import { teamApi } from '../../services/extranetApi';
import { useExtranet } from '../context/ExtranetContext';
import usePageTitle from '../../hooks/usePageTitle';

/** The property's team: invite staff, give each a role, pause or remove them, custom roles. */
const ExtranetTeam = () => {
  usePageTitle('Team');
  const { hotelId, property } = useExtranet();
  if (!hotelId) return null;
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <TeamManager key={hotelId} api={teamApi} hotelTeam title="Team"
        intro={`Who can work on ${property?.name || 'this property'} in the Extranet, and what each person may do. You (the owner) always have full access.`} />
    </div>
  );
};

export default ExtranetTeam;
