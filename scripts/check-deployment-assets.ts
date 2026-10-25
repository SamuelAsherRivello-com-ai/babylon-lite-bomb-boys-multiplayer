import { auditBuildAssets } from './deployment-assets.ts';
const result = await auditBuildAssets({
  directory: 'bomberman-clone/dist',
  deploymentUrl: 'https://samuelasherrivello-com-ai.github.io/babylon-lite-bomb-boys-multiplayer/',
  obsoleteBases: ['/babylon-lite-bomberman-clone/'],
});
if (result.failures.length) throw new Error(result.failures.join('\n'));
console.log('Production asset paths checked:', result.checked.length);
