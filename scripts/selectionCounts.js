const { createClient } = require('@supabase/supabase-js');

// Validate and load environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_URL or SUPABASE_SERVICE_KEY is not set.');
  process.exit(1);
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const updateHorseSelectionCounts = async () => {
  try {
    console.log('Starting script to update horse selection counts.');

    // Get the current date in YYYY-MM-DD format
    const currentDate = new Date().toISOString().split('T')[0];

    console.log(`Processing selections for races on: ${currentDate}`);

    // Step 1: Fetch all races for the current day
    const { data: racesForToday, error: racesError } = await supabase
      .from('race')
      .select('race_id')
      .eq('race_day', currentDate);

    if (racesError) {
      console.error('Error fetching races for today:', racesError.message);
      return;
    }

    if (!racesForToday || racesForToday.length === 0) {
      console.log('No races found for today. Exiting script.');
      return;
    }

    const raceIds = racesForToday.map((race) => race.race_id);

    console.log(`Found ${raceIds.length} races for today:`, raceIds);

    // Step 2: Fetch all user selections for today's races
    const { data: selections, error: selectionsError } = await supabase
      .from('user_selection')
      .select('horse_id')
      .in('race_id', raceIds);

    if (selectionsError) {
      console.error('Error fetching user selections:', selectionsError.message);
      return;
    }

    if (!selections || selections.length === 0) {
      console.log('No user selections found for today\'s races.');
      return;
    }

    console.log(`Found ${selections.length} user selections.`);

    // Step 3: Count the number of selections for each horse
    const selectionCounts = selections.reduce((counts, selection) => {
      counts[selection.horse_id] = (counts[selection.horse_id] || 0) + 1;
      return counts;
    }, {});

    console.log('Selection counts by horse ID:', selectionCounts);

    // Step 4: Update the runner table with the selection counts
    const updates = [];
    for (const [horseId, count] of Object.entries(selectionCounts)) {
      updates.push(
        supabase
          .from('runner')
          .update({ selectedBy: count })
          .eq('runner_id', horseId)
      );
    }

    // Execute all updates in parallel
    const results = await Promise.all(updates);

    // Log any errors during updates
    results.forEach((result, index) => {
      if (result.error) {
        console.error(
          `Error updating selectedBy for horse ID ${Object.keys(selectionCounts)[index]}:`,
          result.error.message
        );
      }
    });

    console.log('Successfully updated selectedBy counts for all horses.');
  } catch (error) {
    console.error('Error during script execution:', error.message);
  }
};

// Execute the script
updateHorseSelectionCounts();
