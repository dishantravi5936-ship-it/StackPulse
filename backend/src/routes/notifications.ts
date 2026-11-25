import { Router } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth.middleware';
import notificationService from '../services/notification.service';

const router = Router();
router.use(requireAuth);

router.get('/', (req: AuthenticatedRequest, res) => {
  res.json({ data: notificationService.listForOwner(req.user!.id) });
});

export default router;
