import { Composition } from 'remotion';
import { Demo, TOTAL } from './Demo';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="DemoLight" component={Demo} durationInFrames={TOTAL} fps={15} width={960} height={540} defaultProps={{ theme: 'light' as const }} />
    <Composition id="DemoDark" component={Demo} durationInFrames={TOTAL} fps={15} width={960} height={540} defaultProps={{ theme: 'dark' as const }} />
  </>
);
