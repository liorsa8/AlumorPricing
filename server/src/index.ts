import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { runMigrations } from './db/connection';
import { seedIfEmpty } from './db/seed';
import { profileSystemsRouter, glassTypesRouter, accessoriesRouter } from './routes/simpleCatalog';
import { openingTypesRouter } from './routes/openingTypes';
import { settingsRouter } from './routes/settings';
import { customersRouter } from './routes/customers';
import { projectsRouter } from './routes/projects';

runMigrations();
seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/profile-systems', profileSystemsRouter);
app.use('/api/glass-types', glassTypesRouter);
app.use('/api/accessories', accessoriesRouter);
app.use('/api/opening-types', openingTypesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/customers', customersRouter);
app.use('/api/projects', projectsRouter);

const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
app.listen(PORT, () => {
  console.log(`AlumorPricing server running on http://localhost:${PORT}`);
});
