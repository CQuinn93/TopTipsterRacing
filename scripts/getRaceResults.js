const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Validate environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !RAPIDAPI_KEY) {
  console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_KEY, or RAPIDAPI_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const apiBaseUrl = 'https://horse-racing.p.rapidapi.com';
const apiHeaders = {
  'x-rapidapi-key': RAPIDAPI_KEY,
  'x-rapidapi-host': 'horse-racing.p.rapidapi.com',
};

// Fetch last race ID
const getLastRaceId = async () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    const { data: races, error } = await supabase
      .from('race')
      .select('race_id, start_time')
      .eq('race_day', today)
      .order('start_time', { ascending: false });

    if (error) throw new Error(`Error fetching races: ${error.message}`);

    for (const race of races) {
      const raceTime = new Date(race.start_time);
      if (raceTime < now) return race.race_id;
    }

    console.log('No races have gone off yet today.');
    return null;
  } catch (error) {
    console.error('Error determining last race ID:', error.message);
    throw error;
  }
};

// Fetch race results
const fetchRaceResults = async (raceId) => {
  try {
    const response = await axios.get(`${apiBaseUrl}/race/${raceId}`, {
      headers: apiHeaders,
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching race results for Race ID ${raceId}:`, error.message);
    throw error;
  }
};

// Update SP Favourite metadata
const updateSPFavouriteMetadata = async (raceId, spFavouriteData) => {
  try {
    console.log(`Updating SP Favourite metadata for Race ID: ${raceId}`);

    const { error: updateError, data: updateData } = await supabase
      .from('runner')
      .update({
        jockey: spFavouriteData.jockey,
        odds: spFavouriteData.odds,
        position: spFavouriteData.position,
        position_points: spFavouriteData.position_points,
        sp_odds_points: spFavouriteData.sp_odds_points,
        total_points: spFavouriteData.total_points,
        cloth_number: spFavouriteData.cloth_number,
        non_runner: spFavouriteData.non_runner,
      })
      .eq('race_id', raceId)
      .eq('name', 'SP Favourite');

    if (updateError) {
      console.error(`Error updating SP Favourite metadata for Race ID ${raceId}:`, updateError.message);
    } else if (updateData.length === 0) {
      console.warn(`No rows updated. SP Favourite record might not exist for Race ID ${raceId}.`);
    } else {
      console.log(`Successfully updated SP Favourite metadata for Race ID ${raceId}`);
    }
  } catch (error) {
    console.error(`Unexpected error while updating SP Favourite metadata for Race ID ${raceId}:`, error.message);
  }
};

// Replace non-runner selections with SP Favourite
const replaceNonRunners = async (raceId, spFavouriteId) => {
  try {
    console.log(`Replacing non-runner selections with SP Favourite for Race ID: ${raceId}`);

    const { data: selections, error: fetchError } = await supabase
      .from('user_selection')
      .select('user_id, horse_id')
      .eq('race_id', raceId);

    if (fetchError) {
      console.error('Error fetching user selections:', fetchError.message);
      return;
    }

    for (const selection of selections) {
      const { data: runner, error: runnerError } = await supabase
        .from('runner')
        .select('non_runner')
        .eq('runner_id', selection.horse_id)
        .single();

      if (runnerError) {
        console.error(`Error fetching runner details for horse_id ${selection.horse_id}:`, runnerError.message);
        continue;
      }

      if (runner.non_runner === '1') {
        const { error: updateError } = await supabase
          .from('user_selection')
          .update({ horse_id: spFavouriteId })
          .eq('user_id', selection.user_id)
          .eq('race_id', raceId);

        if (updateError) {
          console.error(`Error updating user selection for user_id ${selection.user_id}:`, updateError.message);
        } else {
          console.log(`Updated selection for user_id ${selection.user_id} to SP Favourite`);
        }
      }
    }
  } catch (error) {
    console.error(`Error replacing non-runner selections for Race ID ${raceId}:`, error.message);
  }
};

// Update race results and points
const updateRaceResults = async (raceId, raceResults, pointsSystem) => {
  try {
    const horses = raceResults.horses || [];
    const validHorses = horses.filter((horse) => horse.position !== 'ur');
    const numHorses = validHorses.length;
    const isHandicap = raceResults.title.toLowerCase().includes('handicap');

    if (numHorses === 0) {
      console.log('No valid runners found for this race.');
      return;
    }

    console.log(`Total valid runners in race: ${numHorses}`);

    let spFavourite = null;
    for (const horse of validHorses) {
      const spOdds = parseFloat(horse.sp);
      if (!spFavourite || spOdds < spFavourite.odds || (spOdds === spFavourite.odds && horse.cloth_number < spFavourite.cloth_number)) {
        spFavourite = { ...horse, odds: spOdds };
      }
    }

    if (spFavourite) {
      console.log(`SP Favourite determined: ${spFavourite.horse} with odds ${spFavourite.odds}`);
      await updateSPFavouriteMetadata(raceId, spFavourite);
    }

    await replaceNonRunners(raceId, spFavourite.id_horse);
  } catch (error) {
    console.error('Error updating race results:', error.message);
  }
};

// Main function
const processRaceResults = async () => {
  try {
    console.log('Fetching last race ID...');
    const raceId = await getLastRaceId();

    if (!raceId) {
      console.log('No races to process.');
      return;
    }

    console.log(`Fetching results for Race ID: ${raceId}`);
    const raceResults = await fetchRaceResults(raceId);

    console.log('Fetching points system...');
    const { data: pointsSystem, error: pointsError } = await supabase
      .from('points-system')
      .select('*');

    if (pointsError) {
      console.error('Error fetching points system:', pointsError.message);
      return;
    }

    console.log('Updating race results and calculating points...');
    await updateRaceResults(raceId, raceResults, pointsSystem);

    console.log('Race results processed successfully.');
  } catch (error) {
    console.error('Error processing race results:', error.message);
  }
};

processRaceResults();
