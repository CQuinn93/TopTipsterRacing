const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const assignSPFavouriteSelections = async () => {
  try {
    console.log("[INFO] Starting SP Favourite assignment process...");

    // Step 1: Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // Step 2: Fetch all user IDs from the profiles table
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id"); // Retrieve only the user IDs

    if (profilesError) {
      console.error("[ERROR] Fetching user IDs from profiles table:", profilesError.message);
      return;
    }

    const userIds = profiles.map((profile) => profile.id);

    console.log(`[INFO] Retrieved ${userIds.length} user IDs.`);

    

    // Step 3: Fetch all user selections for today
    const { data: userSelections, error: userSelectionsError } = await supabase
      .from("user_selection")
      .select("user_id, race_id")
      .eq("race.race_day", today);

    if (userSelectionsError) {
      console.error("[ERROR] Fetching user selections for today:", userSelectionsError.message);
      return;
    }

    const userSelectionsMap = new Set(userSelections.map((selection) => `${selection.user_id}_${selection.race_id}`));

    console.log(`[INFO] Retrieved ${userSelections.length} user selections for today.`);

    // Step 4: Fetch all races and their SP Favourite runner IDs for today
    const { data: races, error: racesError } = await supabase
      .from("race")
      .select("race_id, runner:runner_id(name)")
      .eq("race_day", today)
      .contains("runner", [{ name: "SP Favourite" }]); // Fetch races with SP Favourite runner

    if (racesError) {
      console.error("[ERROR] Fetching races and SP Favourite runner IDs for today:", racesError.message);
      return;
    }

    const spFavouriteRunners = races.reduce((acc, race) => {
      acc[race.race_id] = race.runner_id;
      return acc;
    }, {});

    console.log(`[INFO] Retrieved ${Object.keys(spFavouriteRunners).length} SP Favourite runners.`);

    // Step 5: Loop through each user and assign SP Favourite selections
    const spFavouriteSelections = [];

    for (const userId of userIds) {
      for (const raceId in spFavouriteRunners) {
        const selectionKey = `${userId}_${raceId}`;

        if (!userSelectionsMap.has(selectionKey)) {
          spFavouriteSelections.push({
            user_id: userId,
            race_id: raceId,
            horse_id: spFavouriteRunners[raceId],
          });
        }
      }
    }

    console.log(`[INFO] Total SP Favourite selections to insert: ${spFavouriteSelections.length}`);

    // Step 6: Insert the SP Favourite selections into the user_selection table
    if (spFavouriteSelections.length > 0) {
      const { error: insertError } = await supabase.from("user_selection").insert(spFavouriteSelections);

      if (insertError) {
        console.error("[ERROR] Inserting SP Favourite selections:", insertError.message);
      } else {
        console.log("[INFO] SP Favourite selections inserted successfully.");
      }
    } else {
      console.log("[INFO] No SP Favourite selections needed to be inserted.");
    }
  } catch (error) {
    console.error("[ERROR] Assigning SP Favourite selections:", error.message);
  }
};

// Execute the script
assignSPFavouriteSelections();
