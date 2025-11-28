-- Add agent_type column to agents table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_type VARCHAR(20) NOT NULL DEFAULT 'perplexity';

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_agents_agent_type ON agents(agent_type);

-- Update existing records to default to 'perplexity' for backward compatibility
UPDATE agents SET agent_type = 'perplexity' WHERE agent_type IS NULL;
