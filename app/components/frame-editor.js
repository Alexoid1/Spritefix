import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class FrameEditorComponent extends Component {
  @service('sprite-forge') forge;

  get selectedFrame() {
    return this.forge.frames[this.forge.sel];
  }

  @action
  editName(frame, event) {
    frame.name = event.target.value;
  }

  @action
  editProp(frame, prop, event) {
    let val = +event.target.value;
    if (prop === 'w' || prop === 'h') val = Math.max(1, val);
    frame[prop] = val;
    this.forge.redraw();
  }
}
