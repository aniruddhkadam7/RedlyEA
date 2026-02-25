import { type Request, type Response, Router } from 'express';
import {
  getMachineDetail,
  ingestMachineInventory,
  listMachines,
} from './liveInventory.service';
import { syncLocalOsqueryMachineIfNeeded } from './osquerySnapshot';

export const createLiveInventoryRouter = () => {
  const router = Router();

  /** Agent pushes machine data here. */
  router.post('/agent/inventory', (req: Request, res: Response) => {
    const result = ingestMachineInventory(req.body);
    if (!result.success) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  });

  /** List all known machines. */
  router.get('/inventory/machines', (_req: Request, res: Response) => {
    syncLocalOsqueryMachineIfNeeded();
    res.json({ success: true, data: listMachines() });
  });

  /** Get detail for a single machine by hostname. */
  router.get('/inventory/machines/:hostname', (req: Request, res: Response) => {
    syncLocalOsqueryMachineIfNeeded();
    let machine = getMachineDetail(req.params.hostname);
    if (!machine) {
      syncLocalOsqueryMachineIfNeeded(true);
      machine = getMachineDetail(req.params.hostname);
    }
    if (!machine) {
      res
        .status(404)
        .json({ success: false, errorMessage: 'Machine not found' });
      return;
    }
    res.json({ success: true, data: machine });
  });

  return router;
};
