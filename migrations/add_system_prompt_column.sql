-- Add system_prompt column to agents table for custom GEMS support
ALTER TABLE agents ADD COLUMN IF NOT EXISTS system_prompt TEXT;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_agents_system_prompt ON agents(system_prompt);
