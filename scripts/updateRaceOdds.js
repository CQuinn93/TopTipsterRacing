const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Supabase client setup
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// API Configuration
const apiBaseUrl = 'https://horse-racing.p.rapidapi.com';
const apiHeaders = {
  'x-rapidapi-key': process.env.RAPIDAPI_KEY,
  'x-rapidapi-host': 'horse-racing.p.rapidapi.com',
};

// Function to fetch race details from the API
const fetchRaceDetails = async (idRace) => {
  try {
    const response = await axios.get(`${apiBaseUrl}/race/${idRace}`, { headers: apiHeaders });
    console.log(`[INFO] Fetched race details for Race ID: ${idRace}`);
    return response.data;
  } catch (error) {
    console.error(`[ERROR] Fetching race details for Race ID ${idRace}:`, error.message);
    return null; // Return null to skip this race if there's an issue
  }
};

// Main function to update race odds
const updateRaceOdds = async () => {
  try {
    console.log("[INFO] Step 1: Determine target date based on current time");

    // Determine the target date
    const now = new Date();
    const targetDate =
      now.getHours() >= 13
        ? new Date(now.setDate(now.getDate() + 1)).toISOString().split('T')[0]
        : now.toISOString().split('T')[0];

    console.log(`[INFO] Target date for race odds update: ${targetDate}`);

    console.log("[INFO] Step 2: Fetch races for the target date");
    const { data: races, error: raceError } = await supabase
      .from('race')
      .select('race_id, race_name')
      .eq('race_day', targetDate);

    if (raceError) {
      console.error("[ERROR] Fetching races from database:", raceError.message);
      return;
    }

    if (!races || races.length === 0) {
      console.log(`[INFO] No races found for the target date: ${targetDate}`);
      return;
    }

    console.log(`[INFO] Found ${races.length} races for the target date.`);

    const updates = [];

    for (const race of races) {
      console.log(`[INFO] Processing race: ${race.race_name} (Race ID: ${race.race_id})`);

      // Fetch the latest odds for this race from the API
      const raceDetails = await fetchRaceDetails(race.race_id);
      if (!raceDetails) {
        console.log(`[WARNING] Skipping Race ID ${race.race_id} due to missing API data.`);
        continue;
      }

      const runners = raceDetails.horses || [];
      if (runners.length === 0) {
        console.log(`[INFO] No runners data found for Race ID: ${race.race_id}`);
        continue;
      }

      // Fetch all current runners from the database for this race
      const { data: existingHorses, error: fetchError } = await supabase
        .from('runner')
        .select('runner_id, name, odds')
        .eq('race_id', race.race_id);

      if (fetchError) {
        console.error(`[ERROR] Fetching runners for Race ID ${race.race_id}:`, fetchError.message);
        continue;
      }

      if (!existingHorses || existingHorses.length === 0) {
        console.log(`[INFO] No existing horses found for Race ID: ${race.race_id}`);
        continue;
      }

      for (const runner of runners) {
        const firstOdd = runner.odds && runner.odds[0] ? parseFloat(runner.odds[0].odd) : null;

        if (firstOdd === null) {
          console.log(`[INFO] Skipping ${runner.horse} - no odds available`);
          continue;
        }

        // Find the corresponding horse in the database
        const existingHorse = existingHorses.find((h) => h.name === runner.horse);

        if (existingHorse && existingHorse.odds !== firstOdd) {
          updates.push({ runner_id: existingHorse.runner_id, odds: firstOdd });
          console.log(`[INFO] Updated odds for ${runner.horse}: ${firstOdd}`);
        }
      }
    }

    // Perform batch updates for all races
    if (updates.length > 0) {
      console.log(`[INFO] Updating odds for ${updates.length} runners across all races.`);
      const { error: updateError } = await supabase.from('runner').upsert(updates);

      if (updateError) {
        console.error("[ERROR] Batch updating odds:", updateError.message);
      } else {
        console.log("[INFO] Successfully updated all odds.");
      }
    } else {
      console.log("[INFO] No odds updates required for the target date.");
    }

    console.log("[INFO] All races processed successfully.");
  } catch (error) {
    console.error("[ERROR] Updating race odds:", error.message);
  }
};

updateRaceOdds();
