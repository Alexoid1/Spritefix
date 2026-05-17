import Component from '@glimmer/component';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

export default class RightSidebarComponent extends Component {
  @service('sprite-forge') forge;

  @action
  selectFrame(index) {
    this.forge.sel = index;
    this.forge.redraw();
  }

  @action
  deleteFrame(index) {
    this.forge.delFrame(index);
  }

  @action
  renderThumb(frame, canvas) {
    if (!this.forge.img) return;
    const ctx = canvas.getContext('2d');
    const sc = Math.min(36 / frame.w, 36 / frame.h);
    const dw = frame.w * sc,
      dh = frame.h * sc;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      this.forge.img,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      (36 - dw) / 2,
      (36 - dh) / 2,
      dw,
      dh,
    );
  }
}
