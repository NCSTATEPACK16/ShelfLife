import './ui/styles/base.css';
import { mountCampaign } from './view/campaign-mode.js';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const uiRoot = document.querySelector<HTMLDivElement>('#ui-root');

if (!canvas || !uiRoot) {
  throw new Error('Boot failed: #game-canvas or #ui-root is missing from index.html');
}

mountCampaign(canvas, uiRoot).catch((error: unknown) => {
  console.error('Campaign mode failed to mount:', error);
});
