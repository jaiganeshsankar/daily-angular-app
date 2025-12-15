import { Component, EventEmitter, Output } from "@angular/core";
import { FormBuilder, Validators } from "@angular/forms"; // Import Validators

@Component({
  selector: "join-form",
  templateUrl: "./join-form.component.html",
  styleUrls: ["./join-form.component.css"],
})
export class JoinFormComponent {
  @Output() setUserName: EventEmitter<string> = new EventEmitter();
  @Output() setUrl: EventEmitter<string> = new EventEmitter();

  joinForm = this.formBuilder.group({
    // Add Validators.required
    name: ["", Validators.required],
    // Add Validators.required and Validators.pattern
    url: ["https://townhall-prod.daily.co/yes", [Validators.required, Validators.pattern("https://.+\\.daily\\.co/.+")]],
  });

  constructor(private formBuilder: FormBuilder) { }

  onSubmit(): void {
    // Check validity before proceeding
    if (!this.joinForm.valid) {
      // Mark all fields as touched to show errors
      this.joinForm.markAllAsTouched();
      return;
    }

    const { name, url } = this.joinForm.value;
    if (!name || !url) return; // Should not happen if valid, but good practice

    // Emit event to update userName var in parent component
    this.setUserName.emit(name);
    // Emit event to update URL var in parent component
    this.setUrl.emit(url);

    // Clear form inputs AFTER emitting, otherwise values might be null
    this.joinForm.reset();
  }
}