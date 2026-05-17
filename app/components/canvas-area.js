import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class CanvasAreaComponent extends Component {
  @service('sprite-forge') forge;

  @action
  setupCanvas(element) {
    this.forge.setCanvas(element);
    if (this.forge.img) {
      this.forge.redraw();
    }
  }

  @action
  onMouseDown(e) {
    this.forge.handleMouseDown(e);
  }

  @action
  onWheel(e) {
    this.forge.handleWheel(e);
  }

  @action
  onDragOver(e) {
    e.preventDefault();
    document.getElementById('dropCard')?.classList.add('hov');
  }

  @action
  onDragLeave() {
    document.getElementById('dropCard')?.classList.remove('hov');
  }

  @action
  onDrop(e) {
    e.preventDefault();
    document.getElementById('dropCard')?.classList.remove('hov');
    this.forge.handleDrop(e);
  }
}
