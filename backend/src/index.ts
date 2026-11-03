import {IBackendModule} from "@kaelteflow/backend-sdk";
import ExampleController from "./controller/ExampleController";

export default class ModuleExample implements IBackendModule {
    controllers = [ExampleController];


}