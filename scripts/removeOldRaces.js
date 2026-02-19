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

const removeOldRaces = async () => {
  try {
    console.log('Starting cleanup process for old races.');

    // Calculate the cutoff date (today - 4 days)
    const currentDate = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(currentDate.getDate() - 3);
    const cutoffDateString = cutoffDate.toISOString().split('T')[0]; // Format YYYY-MM-DD

    console.log(`Removing races older than: ${cutoffDateString}`);

    // Delete races where race_day is less than the cutoff date
    const { error: deleteError } = await supabase
      .from('race')
      .delete()
      .lt('race_day', cutoffDateString);

    if (deleteError) {
      console.error('Error deleting old races:', deleteError.message);
      return;
    }

    console.log(`Successfully deleted races older than ${cutoffDateString} and their associated runners.`);
  } catch (error) {
    console.error('Error during cleanup process:', error.message);
  }
};

// Execute the script
removeOldRaces();
