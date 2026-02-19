const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Ensure environment variables are set via GitHub Actions secrets
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// Validate required environment variables
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

const fetchRacecards = async (date) => {
  try {
    const response = await axios.get(`${apiBaseUrl}/racecards`, {
      headers: apiHeaders,
      params: { date },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching racecards:', error.message);
    throw error;
  }
};

const fetchRaceDetails = async (idRace) => {
  try {
    const response = await axios.get(`${apiBaseUrl}/race/${idRace}`, {
      headers: apiHeaders,
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching race details for Race ID ${idRace}:`, error.message);
    throw error;
  }
};

const populateRaceData = async () => {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const targetDate = tomorrow.toISOString().split('T')[0];

    console.log(`Fetching racecards for: ${targetDate}`);

    const racecardsData = await fetchRacecards(targetDate);

    if (!racecardsData || racecardsData.length === 0) {
      console.log(`No racecards found for the target date: ${targetDate}`);
      return;
    }

    const filteredRaces = racecardsData.filter((race) =>
      race.course.includes('Newcastle') || race.course.includes('Lingfield')
    );

    if (filteredRaces.length === 0) {
      console.log('No races found at these courses.');
      return;
    }

    console.log(`Found ${filteredRaces.length} races.`);

    for (const race of filteredRaces) {
      console.log(`Processing race: ${race.title} at ${race.course}`);

      const raceId = race.id_race;
      const raceDetails = await fetchRaceDetails(raceId);
      const runners = raceDetails?.horses || [];

      const raceData = {
        race_id: raceId,
        race_day: targetDate,
        start_time: race.date,
        race_name: race.title,
        distance: race.distance,
        going: race.going,
        prize: race.prize,
        class: race.class,
        course: race.course,
        racecomplete: race.finished === '1',
      };

      console.log('Upserting race data:', raceData);

      const raceResponse = await supabase.from('race').upsert(raceData);
      if (raceResponse.error) {
        console.error(`Error inserting race: ${race.title}`, raceResponse.error);
        continue;
      }

      for (const runner of runners) {
        const firstOdd = runner.odds?.[0]?.odd ? parseFloat(runner.odds[0].odd) : null;

        const runnerData = {
          race_id: raceId,
          name: runner.horse,
          cloth_number: runner.number || null,
          age: runner.age || null,
          trainer: runner.trainer || null,
          jockey: runner.jockey || null,
          form: runner.form || null,
          rating: runner.OR || null,
          weight: runner.weight || null,
          sp_odds: runner.sp || null,
          odds: firstOdd,
        };

        console.log('Upserting runner data:', runnerData);

        const runnerResponse = await supabase.from('runner').upsert(runnerData);
        if (runnerResponse.error) {
          console.error(`Error inserting runner: ${runner.horse}`, runnerResponse.error);
          continue;
        }
      }

      const spFavouriteData = {
        race_id: raceId,
        name: 'SP Favourite',
        cloth_number: null,
        age: null,
        trainer: null,
        jockey: null,
        form: null,
        rating: null,
        weight: null,
        sp_odds: null,
        odds: null,
      };

      try {
        const spFavouriteResponse = await supabase.from('runner').insert(spFavouriteData);
        if (spFavouriteResponse.error) {
          if (spFavouriteResponse.error.code === '23505') {
            console.log(`SP Favourite runner already exists for race: ${race.title}`);
          } else {
            console.error('Error inserting SP Favourite runner:', spFavouriteResponse.error);
          }
        } else {
          console.log('Inserted SP Favourite runner for race:', race.title);
        }
      } catch (error) {
        console.error('Unexpected error inserting SP Favourite runner:', error.message);
      }
    }

    console.log('All races and runners processed successfully.');
  } catch (error) {
    console.error('Error populating race data:', error.message);
  }
};

populateRaceData();
